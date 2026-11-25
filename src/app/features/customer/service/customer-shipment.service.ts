import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { customerUrlWorks } from '../../../bases/baseurl-customer';
import { createRequest, createResponse } from '../interface/createshipment';

@Injectable({ providedIn: 'root' })
export class CustomerShipmentService {
  private readonly http = inject(HttpClient);

  createShipment(request: createRequest): Observable<createResponse> {
    return this.http.post<createResponse>(
      customerUrlWorks.custUrl + 'CreateIConnectAWB',
      request,
    );
  }
}
