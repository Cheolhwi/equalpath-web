export class ServiceError extends Error {
  constructor(code, status = 503, fields = null) {
    super(code);
    this.code = code;
    this.status = status;
    this.fields = fields;
  }
}
