export class HttpError extends Error {
  constructor(
    public statusCode: number,
    message: string,
  ) {
    super(message);
  }
}
export function fail(code: number, message: string): never {
  throw new HttpError(code, message);
}
