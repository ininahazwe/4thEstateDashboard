// A typed, expected error we can throw from services/controllers and
// translate directly into an HTTP response (see middleware/errorHandler.ts).
export class AppError extends Error {
  constructor(public status: number, message: string, public details?: unknown) {
    super(message);
    this.name = 'AppError';
  }
}
