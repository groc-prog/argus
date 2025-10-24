import logger from '../utilities/logger';

export default abstract class Singleton {
  // eslint-disable-next-line @typescript-eslint/no-unsafe-function-type
  private static instances = new Map<Function, unknown>();
  protected serviceLogger = logger.child({ service: this.constructor.name });

  /**
   * Gets the singleton instance.
   * @template T - The type of the singleton class.
   * @returns Either a new lazily initialized instance or a already created
   * instance of `T`
   */
  public static getInstance<T>(this: new () => T): T {
    if (!Singleton.instances.has(this)) {
      Singleton.instances.set(this, new this());
    }

    return Singleton.instances.get(this) as T;
  }
}
