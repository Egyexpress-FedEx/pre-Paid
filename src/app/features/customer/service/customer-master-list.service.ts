import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { customerUrlWorks } from '../../../bases/baseurl-customer';
import {
  ProductTypeRequest,
  ProductTypeResponse,
  ServiceTypeRequest,
  ServiceTypeResponse,
} from '../interface/servicetype&proudType';

@Injectable({ providedIn: 'root' })
export class CustomerMasterListService {
  private readonly http = inject(HttpClient);

  getProductTypes(userId: string, userPwd: string): Observable<ProductTypeResponse> {
    const request: ProductTypeRequest = {
      UserId: userId,
      UserPwd: userPwd,
      MasterType: 'PROD',
    };

    return this.http.post<ProductTypeResponse>(customerUrlWorks.custUrl + 'MasterList', request);
  }

  getServiceTypes(userId: string, userPwd: string): Observable<ServiceTypeResponse> {
    const request: ServiceTypeRequest = {
      UserId: userId,
      UserPwd: userPwd,
      Filter: " and Category<>'I' and codeid not in ('RTS')",
      MasterType: 'SERV',
    };

    return this.http.post<ServiceTypeResponse>(customerUrlWorks.custUrl + 'MasterListFilter', request);
  }
}
