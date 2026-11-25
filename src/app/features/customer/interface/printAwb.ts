export interface PrintAwbRequest {
  UserID: string
  UserPwd: string
  UsrDtls: string
  SysDtls: string
  Batch_Numbr: string
  ActiveDataBase: string
  ReportSelectionFormula: string
  PrintOption: string
  ReportPath: string
  COMPANY: string
  ADDRESS: string
  LOGIN: string
  Title: string
  ReportFile: string
}
///////////////////
export interface PrintAwbResponse {
  Code: string
  Description: string
  ReportDoc: string
}