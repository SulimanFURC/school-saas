import { HttpClient, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import { environment } from '../../environments/environment';
import { ApiClientError } from '../models/api-client-error';
import { apiErrorInterceptor } from './api-error.interceptor';

describe('apiErrorInterceptor', () => {
  let http: HttpClient;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptors([apiErrorInterceptor])),
        provideHttpClientTesting(),
      ],
    });
    http = TestBed.inject(HttpClient);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('maps API JSON { message } to ApiClientError', (done) => {
    const url = `${environment.apiBaseUrl}/probe`;
    http.get(url).subscribe({
      next: () => done.fail('expected error'),
      error: (e: unknown) => {
        expect(e).toBeInstanceOf(ApiClientError);
        const err = e as ApiClientError;
        expect(err.message).toBe('Invalid payload');
        expect(err.status).toBe(400);
        done();
      },
    });
    const req = httpMock.expectOne(url);
    req.flush({ message: 'Invalid payload' }, { status: 400, statusText: 'Bad Request' });
  });

  it('uses fallback message when body has no message', (done) => {
    const url = `${environment.apiBaseUrl}/probe2`;
    http.get(url).subscribe({
      next: () => done.fail('expected error'),
      error: (e: unknown) => {
        expect(e).toBeInstanceOf(ApiClientError);
        expect((e as ApiClientError).status).toBe(500);
        expect((e as ApiClientError).message).toBe('Internal server error');
        done();
      },
    });
    httpMock.expectOne(url).flush({}, { status: 500, statusText: 'Server Error' });
  });
});
