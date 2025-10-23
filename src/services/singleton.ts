import logger from '../utilities/logger';

export default abstract class Singleton {
  private static instance: unknown;
  protected serviceLogger = logger.child({ service: this.constructor.name });

  /**
   * Gets the singleton instance.
   * @template T - The type of the singleton class.
   * @returns Either a new lazily initialized instance or a already created
   * instance of `T`
   */
  public static getInstance<T>(this: new () => T): T {
    if (!Singleton.instance) Singleton.instance = new this();

    return Singleton.instance as T;
  }
}
