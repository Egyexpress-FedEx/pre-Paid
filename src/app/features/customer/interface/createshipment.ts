export interface createRequest {
  UserID: string
  UserPwd: string
  AWBData: Awbdata
  PackageData: PackageDaum[]
}

export interface Awbdata {
  cl_AWBNo: string
  cl_BillDate: string
  cl_AccountNo: string
  cl_AgentCode: string
  cl_Shipper: string
  cl_ShipperName: string
  cl_ShipperAddress1: string
  cl_ShipperAddress2: string
  cl_ShipperAddress3: string
  cl_ShipperCity: string
  cl_ShipperCountry: string
  cl_ShipperMail: string
  cl_ShipperMakani: string
  cl_ShipperMob1: string
  cl_ShipperMob2: string
  cl_ShipperTel1: string
  cl_ShipperTel2: string
  cl_ShipperZipCode: string
  cl_Consignee: string
  cl_ConsigneeName: string
  cl_ConsigneeAddress1: string
  cl_ConsigneeAddress2: string
  cl_ConsigneeAddress3: string
  cl_ConsigneeCity: string
  cl_ConsigneeCountry: string
  cl_ConsigneeMail: string
  cl_ConsigneeMakani: string
  cl_ConsigneeMob1: string
  cl_ConsigneeMob2: string
  cl_ConsigneeTel1: string
  cl_ConsigneeTel2: string
  cl_ConsigneeZipCode: string
  cl_AWBType: string
  cl_PaymentMethod: string
  cl_Dimension: string
  cl_NoofPieces: string
  cl_NoofShips: string
  cl_Weight: string
  cl_ActWeight: string
  cl_ProductType: string
  cl_Origin: string
  cl_Destination: string
  cl_InsRef: string
  cl_InsAmt: string
  cl_InsProv: string
  cl_InsValue: string
  cl_ShipperRef: string
  cl_PickUpCourier: string
  cl_PickupDate: string
  cl_PickupTime: string
  cl_SpecialInstruct: string
  cl_GoodsDesc: string
  cl_ValueOfShipment: string
  cl_ValueCurrency: string
  cl_CODAmt: string
  cl_CustomerCash: string
  cl_Source: string
  cl_PTAG: string
  cl_DDP: string
  cl_ITAG: string
  cl_ETAG: string
  cl_ATAG: string
  cl_ServiceType: string
}

export interface PackageDaum {
  cl_AWBNo: string
  cl_PkgId: string
  cl_PCs: string
  cl_DimL: string
  cl_DimW: string
  cl_DimH: string
  cl_Weight: string
  cl_ActWeight: string
  cl_GoodsValue: string
  cl_GoodsDesc: string
  cl_DTAG: string
  cl_CRDt: string
}
//////////
export interface createResponse {
  AWBNO: string
  Code: string
  Description: string
  LabelData: string
  Notes: string
}