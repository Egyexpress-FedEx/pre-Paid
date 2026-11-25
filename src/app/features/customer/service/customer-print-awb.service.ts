import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { customerUrlWorks } from '../../../bases/baseurl-customer';
import { PrintAwbRequest, PrintAwbResponse } from '../interface/printAwb';

@Injectable({ providedIn: 'root' })
export class CustomerPrintAwbService {
  private readonly http = inject(HttpClient);

  printAwb(request: PrintAwbRequest): Observable<PrintAwbResponse> {
    return this.http.post<PrintAwbResponse>(
      customerUrlWorks.custUrl + 'PrintAWB',
      request,
    );
  }
}
