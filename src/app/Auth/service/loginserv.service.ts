import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { customerUrlWorks } from '../../bases/baseurl-customer';
import { LoginRequest, LoginResponse } from '../interface/loginint';

@Injectable({ providedIn: 'root' })
export class LoginService {
  private readonly http = inject(HttpClient);

  login(loginRequest: LoginRequest): Observable<LoginResponse> {
    return this.http.post<LoginResponse>(
      customerUrlWorks.custUrl + 'GetIConnectLogin',
      loginRequest,
    );
  }
}