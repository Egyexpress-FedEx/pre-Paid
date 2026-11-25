export interface CityRequest {
  UserID: string
  UserPwd: string
  Filter: string
}
////
export interface CityResponse {
  Code: string
  Description: string
  Response: Response[]
}

export interface Response {
  cl_AreaCode: string
  cl_CodeID: string
  cl_CodeName: string
  cl_CodeType: any
  cl_TelStart: any
  cl_ZipStart: any
}