import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { customerUrlWorks } from '../../../bases/baseurl-customer';
import { SearchQueryRequest, SearchQueryResponse, SearchQuerySqlRequest } from '../models/search-query.model';

@Injectable({ providedIn: 'root' })
export class SearchQueryService {
  private readonly http = inject(HttpClient);
  private readonly sharedAuditCredentials = { userId: 'test', userPwd: 'test' };

  searchAccountShipments(
    userId: string,
    userPwd: string,
    accountNumber: string,
    dateFrom: string,
    dateToExclusive: string,
  ): Observable<SearchQueryResponse> {
    const safeAccountNumber = accountNumber.replace(/'/g, "''");
    const request: SearchQueryRequest = {
      DataBase: null,
      DateFrom: '',
      DateTo: '',
      SqlString: `Select AWBNo as BookingRefNo, Convert(varchar,BillDate,103) PickupReadyDate, Convert(varchar(23),CrDt,121) as ShipmentCreatedAt, Consignee AS SendersName, AccountNo as CustCode, Destination as Origin, NoofPieces, Weight AS ShipmentWeight, ShipperRef from PreAlertAWB where 1=1 and CrDt >= '${dateFrom}' and CrDt < '${dateToExclusive}' and IsNull(AccountNo, '') <> '' and AccountNo = '${safeAccountNumber}' order by CrDt, Awbno`,
      UserID: userId,
      UserPwd: userPwd,
    };

    return this.http.post<SearchQueryResponse>(
      customerUrlWorks.custUrl + 'SearchQuery',
      request,
    );
  }

  searchAllAccountShipments(
    accountNumbers: string[],
    dateFrom: string,
    dateToExclusive: string,
  ): Observable<SearchQueryResponse> {
    const accounts = [...new Set(accountNumbers.map((account) => account.trim()).filter(Boolean))];
    const accountFilter = accounts
      .map((account) => "'" + account.replace(/'/g, "''") + "'")
      .join(',');
    const request: SearchQueryRequest = {
      DataBase: null,
      DateFrom: '',
      DateTo: '',
      SqlString: `Select AWBNo as BookingRefNo, Convert(varchar,BillDate,103) PickupReadyDate, Convert(varchar(23),CrDt,121) as ShipmentCreatedAt, Consignee AS SendersName, AccountNo as CustCode, Destination as Origin, NoofPieces, Weight AS ShipmentWeight, ShipperRef from PreAlertAWB where 1=1 and CrDt >= '${dateFrom}' and CrDt < '${dateToExclusive}' and IsNull(AccountNo, '') <> '' and AccountNo in (${accountFilter}) order by CrDt, Awbno`,
      UserID: this.sharedAuditCredentials.userId,
      UserPwd: this.sharedAuditCredentials.userPwd,
    };

    return this.http.post<SearchQueryResponse>(
      customerUrlWorks.custUrl + 'SearchQuery',
      request,
    );
  }

  setAccountUsersActive(accountNumber: string, isActive: boolean): Observable<SearchQueryResponse> {
    const safeAccountNumber = accountNumber.trim().replace(/'/g, "''");
    const request = this.userMasterRequest(
      `UPDATE [IntegraOnTrack].[dbo].[OnlineUserMaster] SET [Active] = ${isActive ? 1 : 0} WHERE Accno = '${safeAccountNumber}'`,
    );

    return this.http.post<SearchQueryResponse>(
      customerUrlWorks.custUrl + 'SearchQuery',
      request,
    );
  }

  setAccountUsersActiveBulk(updates: Array<{ accountNumber: string; isActive: boolean }>): Observable<SearchQueryResponse> {
    const updatesByAccount = new Map<string, { accountNumber: string; isActive: boolean }>();
    for (const entry of updates) {
      const accountNumber = entry.accountNumber.trim();
      const accountKey = accountNumber.toUpperCase();
      if (accountKey) updatesByAccount.set(accountKey, { accountNumber, isActive: entry.isActive });
    }
    const normalizedUpdates = Array.from(updatesByAccount.values());
    if (normalizedUpdates.length === 0) throw new Error('At least one account is required.');

    const accountFilter = normalizedUpdates
      .map(({ accountNumber }) => `'${accountNumber.replace(/'/g, "''")}'`)
      .join(',');
    const statusCases = normalizedUpdates
      .map(({ accountNumber, isActive }) => `WHEN Accno = '${accountNumber.replace(/'/g, "''")}' THEN ${isActive ? 1 : 0}`)
      .join(' ');
    const request = this.userMasterRequest(
      `UPDATE [IntegraOnTrack].[dbo].[OnlineUserMaster] SET [Active] = CASE ${statusCases} ELSE [Active] END WHERE Accno IN (${accountFilter})`,
    );

    return this.http.post<SearchQueryResponse>(
      customerUrlWorks.custUrl + 'SearchQuery',
      request,
    );
  }

  getAccountUsersActive(accountNumber: string): Observable<SearchQueryResponse> {
    const safeAccountNumber = accountNumber.trim().replace(/'/g, "''");
    return this.http.post<SearchQueryResponse>(
      customerUrlWorks.custUrl + 'SearchQuery',
      this.userMasterRequest(`SELECT Accno,Active FROM [IntegraOnTrack].[dbo].[OnlineUserMaster] WHERE Accno = '${safeAccountNumber}'`),
    );
  }

  getAccountsUsersActive(accountNumbers: string[]): Observable<SearchQueryResponse> {
    const accounts = [...new Set(accountNumbers.map((account) => account.trim()).filter(Boolean))];
    if (accounts.length === 0) throw new Error('At least one account is required.');
    const accountFilter = accounts.map((account) => `'${account.replace(/'/g, "''")}'`).join(',');
    return this.http.post<SearchQueryResponse>(
      customerUrlWorks.custUrl + 'SearchQuery',
      this.userMasterRequest(`SELECT Accno,Active FROM [IntegraOnTrack].[dbo].[OnlineUserMaster] WHERE Accno IN (${accountFilter})`),
    );
  }

  private userMasterRequest(SqlString: string): SearchQuerySqlRequest {
    return {
      UserID: this.sharedAuditCredentials.userId,
      UserPwd: this.sharedAuditCredentials.userPwd,
      SqlString,
      DataBase: 'IntegraOnTrack',
    };
  }

}
