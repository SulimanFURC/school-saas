import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';

import { environment } from '../../environments/environment';

export interface ApiRootResponse {
  message: string;
  tenant: string;
}

@Injectable({ providedIn: 'root' })
export class ApiService {
  baseUrl = environment.apiBaseUrl;

  private http = inject(HttpClient);

  getHello() {
    const headers = new HttpHeaders({
      'x-tenant-id': 'abc',
    });
    return this.http.get<ApiRootResponse>(this.baseUrl, { headers });
  }
}
