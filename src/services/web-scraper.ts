import puppeteer, { ElementHandle, Page } from 'puppeteer';
import { Cron } from 'croner';
import logger from '../utilities/logger';
import dayjs from 'dayjs';
import { MovieModel, type Movie } from '../models/movie';

export class WebScraperService {
  private cronSchedule = process.env.WEB_SCRAPER_SERVICE_CRON;
  private baseUrl = 'https://gleisdorf.dieselkino.at/programmuebersicht';
  private job: Cron | null = null;

  private baseMovieSelector =
    'div.movie-information-is-open div.movie-information div.movie-information-content-wrapper div.movie-content';
  private movieInfoSelector = `${this.baseMovieSelector} div.information-container div.information`;

  static jobName = 'web-scraper-service';

  schedule(): void {
    if (!this.cronSchedule) {
      logger.warn(
        `No cron scheduler found in environment. ${this.constructor.name} will not be scheduled.`,
      );
      return;
    }

    this.job = new Cron(
      this.cronSchedule,
      {
        name: WebScraperService.jobName,
        protect: true,
        catch: (err, executedJob) => {
          const nextSchedulesInMs = executedJob.msToNext();
          logger.error(
            {
              err,
              job: executedJob.name,
              nextScheduleAt: nextSchedulesInMs ? dayjs().add(nextSchedulesInMs, 'ms') : 'unknown',
            },
            'Job failure during execution',
          );
        },
      },
      async () => {
        await this.execute();
      },
    );
  }

  private async execute(): Promise<void> {
    const scrapedMovies: Movie[] = [];

    if (!this.job || !this.job.name) {
      logger.error(
        { service: this.constructor.name },
        'Service not initialized yet, can not run job',
      );
      return;
    }

    const loggerWithJobCtx = logger.child({ job: this.job.name });
    loggerWithJobCtx.info('Starting scheduled job');
    const browser = await puppeteer.launch();

    try {
      loggerWithJobCtx.debug({ baseUrl: this.baseUrl }, 'Navigating to URL and getting page ready');
      const page = await browser.newPage();
      await page.goto(this.baseUrl);
      await page.setViewport({ width: 1080, height: 1024 });
      loggerWithJobCtx.debug('Page navigation and setup done, ready to extract data');

      const movieWrappers = await page.$$('div.poster-info');
      if (movieWrappers.length === 0) {
        loggerWithJobCtx.warn('No movie wrappers found, no data to extract');
        return;
      }

      loggerWithJobCtx.info(`Found ${movieWrappers.length} movie wrapper elements`);
      for (const movieWrapper of movieWrappers) {
        const extractedData = await this.extractMovieContents(page, movieWrapper, this.job.name);
        if (!extractedData) continue;

        scrapedMovies.push(extractedData);
      }

      loggerWithJobCtx.info('Extracted data successfully, storing data to database');
      const operations = scrapedMovies.map((movieData) =>
        MovieModel.findOneAndUpdate(
          { title: movieData.title },
          {
            $set: movieData,
          },
          {
            upsert: true,
          },
        ),
      );

      loggerWithJobCtx.debug(`Running ${operations.length} operations concurrently`);
      await Promise.all(operations);
      loggerWithJobCtx.info('Scheduled job finished');
    } catch (err) {
      loggerWithJobCtx.error(
        { err, job: this.job.name },
        'Failure during job execution, aborting job run',
      );
      await browser.close();
    }
  }

  private async extractMovieContents(
    page: Page,
    element: ElementHandle<HTMLDivElement>,
    jobName: string,
  ): Promise<Movie | null> {
    if (!this.job) {
      logger.error(
        { service: this.constructor.name },
        'Service not initialized yet, can not run job',
      );
      return null;
    }

    const logCtx = { job: jobName, movieWrapper: element.toString() };
    const loggerWithJobCtx = logger.child(logCtx);

    try {
      const extractedMovieData: Partial<Movie> = {};

      loggerWithJobCtx.info(`Extracting data from movie wrapper element ${element.toString()}`);
      loggerWithJobCtx.debug('Triggering click event to expand movie contents');
      await page.evaluate((el) => {
        el.click();
      }, element);

      loggerWithJobCtx.debug(`Waiting for movie content to render`);
      await page.waitForSelector(
        `${this.baseMovieSelector} div.information-container div.information`,
        {
          timeout: 5000,
        },
      );

      loggerWithJobCtx.debug('Trying to extract title');
      extractedMovieData.title = await page.$eval(
        `${this.baseMovieSelector} div.title h2`,
        (el) => el.innerText,
      );

      loggerWithJobCtx.debug(
        'Checking if description contains a button to expand full description',
      );
      const expandButton = await page.$(
        `${this.movieInfoSelector} div.description > button.show-more-or-less-button`,
      );

      // Some descriptions are shortened, so we might need to expand them by clicking on a expand
      // button to render the whole text
      let descriptionElement: ElementHandle<HTMLDivElement | HTMLSpanElement> | null = null;
      if (expandButton) {
        loggerWithJobCtx.debug(
          'Found expand button, trigger click event to expand full description',
        );
        await page.evaluate((element) => {
          element.click();
        }, expandButton);

        descriptionElement = await page.$(`${this.movieInfoSelector} div.description span`);
      } else {
        loggerWithJobCtx.debug(
          'No expand button found, attempting to get description element directly',
        );
        descriptionElement = await page.$(`${this.movieInfoSelector} div.description`);
      }

      if (descriptionElement) {
        loggerWithJobCtx.debug('Trying to extract description');
        extractedMovieData.description = await descriptionElement.evaluate((el) => el.innerText);
      } else loggerWithJobCtx.debug('No description found');

      const ageRatingElement = await page.$(
        `${this.movieInfoSelector} div.more div.info-bundle div.fsk-length-wrapper p.fsk-label span.fsk-text`,
      );
      if (ageRatingElement) {
        logger.debug('Trying to extract age rating');
        extractedMovieData.ageRating =
          (await ageRatingElement.evaluate((el) => el.getAttribute('data-fsk'))) ?? undefined;
      } else logger.debug('No age rating found');

      const durationElement = await page.$(
        `${this.movieInfoSelector} div.more div.info-bundle div.fsk-length-wrapper div.length span.minutes`,
      );
      if (durationElement) {
        logger.debug('Trying to extract duration');
        extractedMovieData.durationMinutes = await durationElement.evaluate((el) => {
          // The duration is defined as `x Minuten`, but we only want to store the number value to
          // be able to query the data easier
          const result = el.innerText.match(/\d+/);
          if (!result) return undefined;

          const numeric = Number(result[0]);
          return Number.isNaN(numeric) ? undefined : numeric;
        });
      } else logger.debug('No duration found');

      const genresElement = await page.$(
        `${this.movieInfoSelector} div.more div.info-bundle p.genres`,
      );
      if (genresElement) {
        logger.debug('Trying to extract genres');
        extractedMovieData.genres = await genresElement.evaluate((el) => {
          // <p> tag has a span nested inside it, so we can not just use the innerText property
          const genresAsString = Array.from(el.childNodes)
            .filter((node) => node.nodeType === Node.TEXT_NODE)
            .map((node) => node.textContent?.trim())
            .join(' ');

          return genresAsString.split(',').map((genre) => genre.trim());
        });
      } else logger.debug('No genres found');

      const screeningWrappers = await page.$$(
        `${this.baseMovieSelector} div.movie-times-wrapper div.movie-times div.movie-times-item`,
      );
      if (screeningWrappers.length === 0)
        logger.info('No screening wrappers found, no data to extract');

      logger.info(`Found ${screeningWrappers.length} movie wrapper elements`);
      for (const screeningWrapper of screeningWrappers) {
        const extractedScreeningData = await this.extractScreeningContents(
          page,
          screeningWrapper,
          logCtx,
        );
        if (!extractedScreeningData) continue;

        if (!extractedMovieData.screenings)
          extractedMovieData.screenings = [] as unknown as Movie['screenings'];
        extractedMovieData.screenings.push(...extractedScreeningData);
      }

      return extractedMovieData as Movie;
    } catch (err) {
      loggerWithJobCtx.error(
        { err, element: element.toString() },
        'Failure during element extraction, skipping element',
      );
      return null;
    }
  }

  private async extractScreeningContents(
    page: Page,
    screeningElement: ElementHandle<HTMLDivElement>,
    logCtx: { job: string; movieWrapper: string },
  ): Promise<Movie['screenings'] | null> {
    const loggerWithJobCtx = logger.child({
      ...logCtx,
      screeningWrapper: screeningElement.toString(),
    });
    const extractedScreeningData = [] as unknown as Movie['screenings'];

    try {
      loggerWithJobCtx.info(
        `Extracting data from screening wrapper element ${screeningElement.toString()}`,
      );
      loggerWithJobCtx.debug('Trying to extract screening date');
      const screeningDate = await screeningElement.$eval('div.date', (el) => el.innerText);

      loggerWithJobCtx.debug('Trying to extract show wrappers');
      const showWrappers = await screeningElement.$$('div.showtime-container div.show-wrapper');

      for (const showElement of showWrappers) {
        loggerWithJobCtx.debug('Trying to extract start time');
        const startTimeString = await showElement.$eval('span.showtime', (el) => el.innerText);

        loggerWithJobCtx.debug('Trying to extract auditorium');
        const auditorium = await screeningElement.$eval(
          'div.performance-attributes span.theatre-name',
          (el) => el.innerText,
        );

        loggerWithJobCtx.debug('Trying to extract show features');
        const showFeatures = await showElement.$$eval(
          'div.performance-attributes div.attribute span',
          (els) =>
            els
              .map((el) => el.getAttribute('data-attribute'))
              .filter((feature) => feature !== null),
        );

        extractedScreeningData.push({
          startTime: this.parseScreeningStartTime(screeningDate, startTimeString),
          auditorium,
          features: showFeatures,
        });
      }

      return extractedScreeningData;
    } catch (err) {
      loggerWithJobCtx.error(
        { err, element: screeningElement.toString() },
        'Failure during element extraction, skipping element',
      );
      return null;
    }
  }

  private parseScreeningStartTime(dateString: string, showtime: string): Date {
    const normalizedDateString = dateString.trim().toLowerCase();
    const [hour, minute] = showtime.split(':');

    // In case the movie is scheduled for today, `Heute` is shown instead if a value
    if (normalizedDateString === 'heute') {
      return dayjs()
        .tz('Europe/Vienna')
        .startOf('day')
        .set('hour', Number(hour))
        .set('minute', Number(minute))
        .toDate();
    }

    // The date string can either be `<two letter week day>., <day>.<month>.` or in some special cases
    // `<two letter week day>., <day>.<month>.<two decimal year>`
    const dateInfo = normalizedDateString.match(/\d{1,2}\.\d{1,2}(?:\.\d{1,2})?\.$/);
    if (!dateInfo) throw new Error('No valid date format found');

    const [day, month, year = ''] = dateInfo[0].split('.');
    return dayjs(
      `${year.length !== 0 ? Number(year) : dayjs().get('year')}-${Number(month)}-${Number(day)}`,
    )
      .tz('Europe/Vienna')
      .startOf('day')
      .set('hour', Number(hour))
      .set('minute', Number(minute))
      .toDate();
  }
}
