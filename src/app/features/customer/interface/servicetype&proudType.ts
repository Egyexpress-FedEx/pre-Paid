export interface ProductTypeRequest {
  UserId: string;
  UserPwd: string;
  MasterType: 'PROD';
}

export interface ServiceTypeRequest {
  UserId: string;
  UserPwd: string;
  Filter: string;
  MasterType: 'SERV';
}

export interface MasterListItem {
  cl_Amt1: number | string | null;
  cl_Amt2: number | string | null;
  cl_Category: string | null;
  cl_CodeID: string;
  cl_CodeName: string;
  cl_CodeType: string | null;
  cl_Desc1: string | null;
  cl_Desc2: string | null;
  cl_Desc3: string | null;
  cl_EffectDate: string | null;
  cl_IsActive: boolean | string | null;
  cl_Note: string | null;
}

export interface ProductTypeResponse {
  Code: string;
  Description: string;
  Response: MasterListItem[] | null;
}

export interface ServiceTypeResponse {
  Code: string;
  Description: string;
  Response: MasterListItem[] | null;
}
