import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { customerUrlWorks } from '../../../bases/baseurl-customer';
import { CityRequest, CityResponse } from '../interface/city';
import { ShiperAccountDetailsRequest, ShiperAccountDetailsResponse } from '../interface/shiperAccountDetials';

@Injectable({ providedIn: 'root' })
export class CustomerShipmentReferenceService {
  private readonly http = inject(HttpClient);

  getAccountDetails(userId: string, userPwd: string, accountNo: string): Observable<ShiperAccountDetailsResponse> {
    const request: ShiperAccountDetailsRequest = {
      UserID: userId,
      UserPwd: userPwd,
      AccountNo: accountNo,
    };

    return this.http.post<ShiperAccountDetailsResponse>(
      customerUrlWorks.custUrl + 'GetAccountDetails',
      request,
    );
  }

  getCities(userId: string, userPwd: string): Observable<CityResponse> {
    const request: CityRequest = {
      UserID: userId,
      UserPwd: userPwd,
      Filter: "CodeType='CITY' and AreaCode='EG' ",
    };

    return this.http.post<CityResponse>(
      customerUrlWorks.custUrl + 'GetCityListFilterWise',
      request,
    );
  }
}
