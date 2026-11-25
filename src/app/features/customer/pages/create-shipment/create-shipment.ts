import { DOCUMENT, isPlatformBrowser } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, computed, DestroyRef, inject, OnInit, PLATFORM_ID, signal } from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { EMPTY, Subject, catchError, concatMap, exhaustMap, finalize, map, of, startWith, tap, throwError } from 'rxjs';
import { AdminDataService } from '../../../../Admin/shared/services/admin-data.service';
import { AuthService } from '../../../../core/auth/auth.service';
import { CityResponse } from '../../interface/city';
import { createRequest } from '../../interface/createshipment';
import { CustomerDetails } from '../../interface/shiperAccountDetials';
import { ProductTypeResponse, ServiceTypeResponse, MasterListItem } from '../../interface/servicetype&proudType';
import { CustomerMasterListService } from '../../service/customer-master-list.service';
import { CustomerShipmentService } from '../../service/customer-shipment.service';
import { CustomerShipmentReferenceService } from '../../service/customer-shipment-reference.service';
import { CustomerState } from '../../../../shared/state/customer.state';
import { PrintAwbRequest, PrintAwbResponse } from '../../interface/printAwb';
import { CustomerPrintAwbService } from '../../service/customer-print-awb.service';

interface ShipmentSubmission {
  request: createRequest;
  userId: string;
  userPwd: string;
  accountNumber: string;
  reportFile: string;
}

interface ShipmentPrintResult {
  awbNumber: string;
  packageRecorded: boolean;
  printResponse: PrintAwbResponse | null;
  printError?: string;
}

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule],
  selector: 'app-create-shipment',
  styleUrl: './create-shipment.css',
  templateUrl: './create-shipment.html',
})
export class CreateShipmentPage implements OnInit {
  private readonly formBuilder = inject(FormBuilder);
  private readonly authService = inject(AuthService);
  private readonly document = inject(DOCUMENT);
  protected readonly customerState = inject(CustomerState);
  private readonly sanitizer = inject(DomSanitizer);
  private readonly destroyRef = inject(DestroyRef);
  private readonly adminData = inject(AdminDataService);
  private readonly masterListService = inject(CustomerMasterListService);
  private readonly shipmentService = inject(CustomerShipmentService);
  private readonly printAwbService = inject(CustomerPrintAwbService);
  private readonly referenceService = inject(CustomerShipmentReferenceService);
  private readonly platformId = inject(PLATFORM_ID);
  private readonly shipmentSubmissions = new Subject<ShipmentSubmission>();
  private reportObjectUrl: string | null = null;

  protected readonly activeStep = signal(1);
  protected readonly accountNumber = this.authService.currentUser()?.accountNumber ?? '';
  protected readonly productTypes = signal<MasterListItem[]>([]);
  protected readonly serviceTypes = signal<MasterListItem[]>([]);
  protected readonly productsLoading = signal(false);
  protected readonly servicesLoading = signal(false);
  protected readonly productError = signal('');
  protected readonly serviceError = signal('');
  protected readonly cities = signal<CityResponse['Response']>([]);
  protected readonly citiesLoading = signal(false);
  protected readonly citiesError = signal('');
  protected readonly accountDetailsLoading = signal(false);
  protected readonly accountDetailsError = signal('');
  protected readonly isSubmitting = signal(false);
  protected readonly submitError = signal('');
  protected readonly printError = signal('');
  protected readonly successAwb = signal('');
  protected readonly reportDocument = signal<SafeResourceUrl | null>(null);
  private readonly accountDetails = signal<CustomerDetails | null>(null);
  protected readonly printFormats = [
    { label: 'A4 standard sheet (PDF)', report: 'PreAlertNormal.rpt' },
    { label: 'Thermal label', report: 'PreAlertLabel.rpt' },
    { label: 'Special label layout', report: 'PreAlertLabelSpl.rpt' },
    { label: 'Label with package grid', report: 'PreAlertLabelPackage.rpt' },
    { label: 'Label with instructions', report: 'PreAlertLabelIns.rpt' },
  ];

  protected readonly senderForm = this.formBuilder.group({
    accountNumber: [{ value: this.authService.currentUser()?.accountNumber ?? '', disabled: true }],
    accountName: ['', Validators.required],
    contactPerson: [this.authService.currentUser()?.displayName ?? '', Validators.required],
    addressLine1: ['', Validators.required],
    addressLine2: [''],
    addressLine3: [''],
    city: ['', Validators.required],
    phone: ['', Validators.required],
    mobile: [''],
    email: ['', Validators.email],
  });

  protected readonly recipientForm = this.formBuilder.group({
    companyName: ['', Validators.required],
    contactPerson: ['', Validators.required],
    addressLine1: ['', Validators.required],
    addressLine2: [''],
    addressLine3: [''],
    city: ['', Validators.required],
    phone: ['', Validators.required],
    mobile: [''],
    email: ['', Validators.email],
  });

  protected readonly detailsForm = this.formBuilder.group({
    billingDate: [this.localDate()],
    shipperReference: [''],
    productType: ['', Validators.required],
    serviceLevel: ['', Validators.required],
    totalPiecesCount: [1, [Validators.required, Validators.min(1), Validators.pattern(/^[1-9]\d*$/)]],
    cashToCollect: ['0', Validators.min(0)],
    printFormat: ['', Validators.required],
    goodsDescription: [''],
  });

  protected readonly packageRows = this.formBuilder.array([this.createPackageRow()]);
  protected readonly shipmentForm = this.formBuilder.group({
    sender: this.senderForm,
    recipient: this.recipientForm,
    details: this.detailsForm,
    packageRows: this.packageRows,
  });
  private readonly shipmentFormValue = toSignal(
    this.shipmentForm.valueChanges.pipe(startWith(this.shipmentForm.getRawValue())),
    { initialValue: this.shipmentForm.getRawValue() },
  );

  ngOnInit(): void {
    this.destroyRef.onDestroy(() => this.releaseReportDocument());
    this.connectShipmentFlow();
    if (!isPlatformBrowser(this.platformId)) return;
    this.loadProductTypes();
    this.loadServiceTypes();
    this.loadAccountDetails();
    this.loadCities();
  }

  protected loadProductTypes(): void {
    const credentials = this.authService.currentUser();
    if (!credentials?.apiUserId || !credentials.apiUserPassword) {
      this.productError.set('Sign in again to load product types.');
      return;
    }

    this.productsLoading.set(true);
    this.productError.set('');
    this.masterListService.getProductTypes(credentials.apiUserId, credentials.apiUserPassword).subscribe({
      next: (response) => {
        this.productsLoading.set(false);
        this.productTypes.set(this.responseSucceeded(response) ? response.Response ?? [] : []);
        if (!this.responseSucceeded(response)) {
          this.productError.set(response.Description || 'Could not load product types.');
        }
      },
      error: (error: unknown) => {
        this.productsLoading.set(false);
        this.productError.set(this.readApiError(error, 'Could not load product types.'));
      },
    });
  }

  protected loadServiceTypes(): void {
    const credentials = this.authService.currentUser();
    if (!credentials?.apiUserId || !credentials.apiUserPassword) {
      this.serviceError.set('Sign in again to load service types.');
      return;
    }

    this.servicesLoading.set(true);
    this.serviceError.set('');
    this.masterListService.getServiceTypes(credentials.apiUserId, credentials.apiUserPassword).subscribe({
      next: (response) => {
        this.servicesLoading.set(false);
        this.serviceTypes.set(this.responseSucceeded(response) ? response.Response ?? [] : []);
        if (!this.responseSucceeded(response)) {
          this.serviceError.set(response.Description || 'Could not load service types.');
        }
      },
      error: (error: unknown) => {
        this.servicesLoading.set(false);
        this.serviceError.set(this.readApiError(error, 'Could not load service types.'));
      },
    });
  }

  protected loadAccountDetails(): void {
    const credentials = this.authService.currentUser();
    const accountNumber = credentials?.accountNumber;
    if (!credentials?.apiUserId || !credentials.apiUserPassword || !accountNumber) {
      this.accountDetailsError.set('Sign in again to load your account details.');
      return;
    }

    this.accountDetailsLoading.set(true);
    this.accountDetailsError.set('');
    this.referenceService.getAccountDetails(credentials.apiUserId, credentials.apiUserPassword, accountNumber).subscribe({
      next: (response) => {
        this.accountDetailsLoading.set(false);
        if (!this.responseSucceeded(response) || !response.CustomerDetails) {
          this.accountDetailsError.set(response.Description || 'Could not load your account details.');
          return;
        }

        this.accountDetails.set(response.CustomerDetails);
        this.applyAccountDetails(response.CustomerDetails);
      },
      error: (error: unknown) => {
        this.accountDetailsLoading.set(false);
        this.accountDetailsError.set(this.readApiError(error, 'Could not load your account details.'));
      },
    });
  }

  protected loadCities(): void {
    const credentials = this.authService.currentUser();
    if (!credentials?.apiUserId || !credentials.apiUserPassword) {
      this.citiesError.set('Sign in again to load cities.');
      return;
    }

    this.citiesLoading.set(true);
    this.citiesError.set('');
    this.referenceService.getCities(credentials.apiUserId, credentials.apiUserPassword).subscribe({
      next: (response) => {
        this.citiesLoading.set(false);
        this.cities.set(this.responseSucceeded(response) ? response.Response ?? [] : []);
        if (!this.responseSucceeded(response)) {
          this.citiesError.set(response.Description || 'Could not load cities.');
          return;
        }

        const accountCity = this.accountDetails()?.cl_CustCity;
        if (typeof accountCity === 'string' && accountCity.trim()) {
          this.setIfPristine(this.senderForm.controls.city, this.cityCode(accountCity));
        }
      },
      error: (error: unknown) => {
        this.citiesLoading.set(false);
        this.citiesError.set(this.readApiError(error, 'Could not load cities.'));
      },
    });
  }

  protected readonly packageWeightRows = computed(() => {
    const rows = this.shipmentFormValue().packageRows ?? [];
    return rows.map((row) => {
      const length = this.positiveNumber(row.length);
      const width = this.positiveNumber(row.width);
      const height = this.positiveNumber(row.height);
      const actualWeight = this.positiveNumber(row.actualWeight);
      const volumetricWeight = (length * width * height) / 3000;

      return {
        actualWeight,
        volumetricWeight,
        chargeableWeight: Math.max(actualWeight, volumetricWeight),
      };
    });
  });

  protected readonly totalActualWeight = computed(() =>
    this.roundWeight(this.packageWeightRows().reduce((total, row) => total + row.actualWeight, 0)),
  );

  protected readonly totalVolumetricWeight = computed(() =>
    this.roundWeight(this.packageWeightRows().reduce((total, row) => total + row.volumetricWeight, 0)),
  );

  protected readonly totalChargeableWeight = computed(() =>
    this.roundWeight(this.packageWeightRows().reduce((total, row) => total + row.chargeableWeight, 0)),
  );

  protected nextStep(): void {
    this.goToStep(Math.min(3, this.activeStep() + 1));
  }

  protected previousStep(): void {
    this.activeStep.update((step) => Math.max(1, step - 1));
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  protected goToStep(step: number): void {
    if (step < 1 || step > 3) return;
    if (step > this.activeStep()) {
      for (let currentStep = this.activeStep(); currentStep < step; currentStep += 1) {
        if (!this.validateStep(currentStep)) {
          this.activeStep.set(currentStep);
          window.scrollTo({ top: 0, behavior: 'smooth' });
          return;
        }
      }
    }
    this.activeStep.set(step);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  protected createShipment(): void {
    if (this.isSubmitting()) return;
    this.submitError.set('');
    if (this.customerState.shipmentRemaining() <= 0) {
      this.submitError.set('No active package has shipments available. Contact the administrator to add or activate a package.');
      return;
    }
    this.ensureMinimumPieces();
    for (let step = 1; step <= 3; step += 1) {
      if (!this.validateStep(step)) {
        this.activeStep.set(step);
        window.scrollTo({ top: 0, behavior: 'smooth' });
        return;
      }
    }

    const credentials = this.authService.currentUser();
    if (!credentials?.apiUserId || !credentials.apiUserPassword || !credentials.accountNumber) {
      this.submitError.set('Your sign-in session is missing API credentials. Sign in again and retry.');
      return;
    }
    if (!this.adminData.hasAvailablePackage(credentials.accountNumber)) {
      this.submitError.set('There are no active shipments left in your packages. Contact the administrator.');
      return;
    }

    this.shipmentSubmissions.next({
      request: this.buildCreateRequest(credentials.apiUserId, credentials.apiUserPassword),
      userId: credentials.apiUserId,
      userPwd: credentials.apiUserPassword,
      accountNumber: credentials.accountNumber,
      reportFile: this.apiText(this.detailsForm.controls.printFormat.value),
    });
  }

  protected openReportDocument(): void {
    if (this.reportObjectUrl) window.open(this.reportObjectUrl, '_blank', 'noopener');
  }

  protected closeSuccessDialog(): void {
    this.downloadReportDocument();
    this.successAwb.set('');
    this.printError.set('');
    this.reportDocument.set(null);
  }

  private downloadReportDocument(): void {
    if (!this.reportObjectUrl || !isPlatformBrowser(this.platformId)) return;

    const downloadLink = this.document.createElement('a');
    downloadLink.href = this.reportObjectUrl;
    downloadLink.download = `AWB-${this.successAwb() || 'shipment'}.pdf`;
    downloadLink.style.display = 'none';
    this.document.body.appendChild(downloadLink);
    downloadLink.click();
    downloadLink.remove();
  }

  protected syncPackageRows(): void {
    const count = Number(this.detailsForm.controls.totalPiecesCount.value);
    if (!Number.isInteger(count) || count < 1) return;

    while (this.packageRows.length < count) this.packageRows.push(this.createPackageRow());
    while (this.packageRows.length > count) this.packageRows.removeAt(this.packageRows.length - 1);
  }

  protected ensureMinimumPieces(): void {
    const value = Number(this.detailsForm.controls.totalPiecesCount.value);
    const count = Number.isFinite(value) ? Math.max(1, Math.floor(value)) : 1;
    this.detailsForm.controls.totalPiecesCount.setValue(count);
    this.syncPackageRows();
  }

  protected formatWeight(weight: number): string {
    return weight.toFixed(2);
  }

  protected controlInvalid(control: { invalid: boolean; touched: boolean }): boolean {
    return control.invalid && control.touched;
  }

  private validateStep(step: number): boolean {
    const form = step === 1 ? this.senderForm : step === 2 ? this.recipientForm : this.detailsForm;
    form.markAllAsTouched();
    if (step === 3) this.packageRows.markAllAsTouched();

    const valid = form.valid && (step !== 3 || this.packageRows.valid);
    this.submitError.set(valid ? '' : 'Complete the required fields on this step before continuing.');
    return valid;
  }

  private connectShipmentFlow(): void {
    this.shipmentSubmissions.pipe(
      exhaustMap((submission) => {
        this.isSubmitting.set(true);
        this.submitError.set('');
        this.printError.set('');

        return this.shipmentService.createShipment(submission.request).pipe(
          concatMap((response) => {
            if (!this.responseSucceeded(response)) {
              return throwError(() => new Error(response.Description || response.Notes || 'The shipment could not be created.'));
            }
            const awbNumber = response.AWBNO?.trim();
            if (!awbNumber) {
              return throwError(() => new Error(response.Notes || 'The API reported success but did not return an AWB number.'));
            }

            const packageRecorded = this.adminData.recordShipmentForAccount(
              submission.accountNumber,
              awbNumber,
            );
            const printRequest = this.buildPrintRequest(submission, awbNumber);

            return this.printAwbService.printAwb(printRequest).pipe(
              map((printResponse): ShipmentPrintResult => ({
                awbNumber,
                packageRecorded,
                printResponse,
              })),
              catchError((error: unknown) => of<ShipmentPrintResult>({
                awbNumber,
                packageRecorded,
                printResponse: null,
                printError: this.readApiError(error, 'The shipment was created, but the AWB could not be printed.'),
              })),
            );
          }),
          tap((result) => this.completeSuccessfulShipment(result)),
          catchError((error: unknown) => {
            this.submitError.set(this.readApiError(error, 'The shipment could not be created. Please try again.'));
            return EMPTY;
          }),
          finalize(() => this.isSubmitting.set(false)),
        );
      }),
      takeUntilDestroyed(this.destroyRef),
    ).subscribe();
  }

  private buildPrintRequest(submission: ShipmentSubmission, awbNumber: string): PrintAwbRequest {
    return {
      UserID: submission.userId,
      UserPwd: submission.userPwd,
      UsrDtls: submission.accountNumber,
      SysDtls: submission.userId,
      Batch_Numbr: awbNumber,
      ActiveDataBase: 'Integraontrack',
      ReportSelectionFormula: '',
      PrintOption: 'PDF',
      ReportPath: 'OPS',
      COMPANY: 'EGYPT EXPRESS',
      ADDRESS: 'CAIRO',
      LOGIN: submission.userId,
      Title: 'AWB',
      ReportFile: submission.reportFile,
    };
  }

  private completeSuccessfulShipment(result: ShipmentPrintResult): void {
    const warnings: string[] = [];
    if (!result.packageRecorded) {
      warnings.push('The shipment was created, but it could not be assigned to a prepaid package. Contact the administrator.');
    }

    if (result.printError) {
      warnings.push(result.printError);
    } else if (result.printResponse?.Code === '1'
      && result.printResponse.Description?.toUpperCase() === 'SUCCESS') {
      if (result.printResponse.ReportDoc) {
        try {
          this.setReportDocument(result.printResponse.ReportDoc);
        } catch {
          warnings.push('The shipment was created, but the returned PDF could not be opened.');
        }
      } else {
        warnings.push('The print service succeeded but did not return the PDF document.');
      }
    } else {
      const description = result.printResponse?.Description;
      warnings.push(description && description.toUpperCase() !== 'SUCCESS'
        ? description
        : 'The shipment was created, but the AWB could not be printed.');
    }

    this.printError.set(warnings.join(' '));
    this.successAwb.set(result.awbNumber);
    this.resetForNextShipment();
  }

  private setReportDocument(reportDoc: string): void {
    const encodedPdf = reportDoc
      .replace(/^data:application\/pdf;base64,/i, '')
      .replace(/\s/g, '');
    const binaryPdf = atob(encodedPdf);
    const pdfBytes = Uint8Array.from(binaryPdf, (character) => character.charCodeAt(0));
    const objectUrl = URL.createObjectURL(new Blob([pdfBytes], { type: 'application/pdf' }));

    if (this.reportObjectUrl) URL.revokeObjectURL(this.reportObjectUrl);
    this.reportObjectUrl = objectUrl;
    this.reportDocument.set(this.sanitizer.bypassSecurityTrustResourceUrl(objectUrl));
  }

  private releaseReportDocument(): void {
    if (!this.reportObjectUrl) return;
    URL.revokeObjectURL(this.reportObjectUrl);
    this.reportObjectUrl = null;
  }

  private resetForNextShipment(): void {
    this.recipientForm.reset({
      companyName: '', contactPerson: '', addressLine1: '', addressLine2: '', addressLine3: '',
      city: '', phone: '', mobile: '', email: '',
    });
    this.detailsForm.reset({
      billingDate: this.localDate(), shipperReference: '', productType: '', serviceLevel: '',
      totalPiecesCount: 1, cashToCollect: '0', printFormat: '', goodsDescription: '',
    });
    this.packageRows.clear();
    this.packageRows.push(this.createPackageRow());
    this.senderForm.markAsPristine();
    this.senderForm.markAsUntouched();
    this.shipmentForm.markAsPristine();
    this.shipmentForm.markAsUntouched();
    this.activeStep.set(1);
  }

  private createPackageRow() {
    return this.formBuilder.group({
      description: [''],
      length: [null as number | null, [Validators.required, Validators.min(0.1)]],
      width: [null as number | null, [Validators.required, Validators.min(0.1)]],
      height: [null as number | null, [Validators.required, Validators.min(0.1)]],
      actualWeight: [null as number | null, [Validators.required, Validators.min(0.01)]],
    });
  }

  private positiveNumber(value: unknown): number {
    const number = Number(value);
    return Number.isFinite(number) && number > 0 ? number : 0;
  }

  private roundWeight(weight: number): number {
    return Math.round((weight + Number.EPSILON) * 100) / 100;
  }

  private buildCreateRequest(userId: string, userPwd: string): createRequest {
    const sender = this.senderForm.getRawValue();
    const recipient = this.recipientForm.getRawValue();
    const details = this.detailsForm.getRawValue();
    const packageValues = this.packageRows.getRawValue();
    const senderCity = this.cities().find((city) => city.cl_CodeID === sender.city);
    const recipientCity = this.cities().find((city) => city.cl_CodeID === recipient.city);
    const weights = this.packageWeightRows();
    const dimension = (row: typeof packageValues[number]) =>
      [row.length, row.width, row.height].map((value) => this.apiNumber(value)).join('X');

    return {
      UserID: userId,
      UserPwd: userPwd,
      AWBData: {
        cl_AWBNo: '',
        cl_BillDate: details.billingDate || this.localDate(),
        cl_AccountNo: this.accountNumber,
        cl_AgentCode: '',
        cl_Shipper: this.apiText(sender.accountName),
        cl_ShipperName: this.apiText(sender.contactPerson),
        cl_ShipperAddress1: this.apiText(sender.addressLine1),
        cl_ShipperAddress2: this.apiText(sender.addressLine2),
        cl_ShipperAddress3: this.apiText(sender.addressLine3),
        cl_ShipperCity: senderCity?.cl_CodeName ?? '',
        cl_ShipperCountry: senderCity?.cl_AreaCode ?? 'EG',
        cl_ShipperMail: this.apiText(sender.email),
        cl_ShipperMakani: '',
        cl_ShipperMob1: this.apiText(sender.mobile),
        cl_ShipperMob2: '',
        cl_ShipperTel1: this.apiText(sender.phone),
        cl_ShipperTel2: '',
        cl_ShipperZipCode: '',
        cl_Consignee: this.apiText(recipient.companyName),
        cl_ConsigneeName: this.apiText(recipient.contactPerson),
        cl_ConsigneeAddress1: this.apiText(recipient.addressLine1),
        cl_ConsigneeAddress2: this.apiText(recipient.addressLine2),
        cl_ConsigneeAddress3: this.apiText(recipient.addressLine3),
        cl_ConsigneeCity: recipientCity?.cl_CodeName ?? '',
        cl_ConsigneeCountry: recipientCity?.cl_AreaCode ?? 'EG',
        cl_ConsigneeMail: this.apiText(recipient.email),
        cl_ConsigneeMakani: '',
        cl_ConsigneeMob1: this.apiText(recipient.mobile),
        cl_ConsigneeMob2: '',
        cl_ConsigneeTel1: this.apiText(recipient.phone),
        cl_ConsigneeTel2: '',
        cl_ConsigneeZipCode: '',
        cl_AWBType: '',
        cl_PaymentMethod: '',
        cl_Dimension: packageValues.length === 1 ? dimension(packageValues[0]) : '',
        cl_NoofPieces: String(packageValues.length),
        cl_NoofShips: '',
        cl_Weight: this.apiNumber(this.totalChargeableWeight()),
        cl_ActWeight: this.apiNumber(this.totalActualWeight()),
        cl_ProductType: this.apiText(details.productType),
        cl_Origin: senderCity?.cl_CodeID ?? '',
        cl_Destination: recipientCity?.cl_CodeID ?? '',
        cl_InsRef: '',
        cl_InsAmt: '',
        cl_InsProv: '',
        cl_InsValue: '',
        cl_ShipperRef: this.apiText(details.shipperReference),
        cl_PickUpCourier: '',
        cl_PickupDate: details.billingDate || this.localDate(),
        cl_PickupTime: '',
        cl_SpecialInstruct: '',
        cl_GoodsDesc: this.apiText(details.goodsDescription),
        cl_ValueOfShipment: '0',
        cl_ValueCurrency: '',
        cl_CODAmt: '0',
        cl_CustomerCash: this.apiNumber(details.cashToCollect),
        cl_Source: 'ICO',
        cl_PTAG: 'N',
        cl_DDP: '',
        cl_ITAG: 'Y',
        cl_ETAG: 'Y',
        cl_ATAG: 'Y',
        cl_ServiceType: this.apiText(details.serviceLevel),
      },
      PackageData: packageValues.map((row, index) => ({
        cl_AWBNo: '',
        cl_PkgId: '',
        cl_PCs: '1',
        cl_DimL: this.apiNumber(row.length),
        cl_DimW: this.apiNumber(row.width),
        cl_DimH: this.apiNumber(row.height),
        cl_Weight: this.apiNumber(weights[index]?.chargeableWeight ?? 0),
        cl_ActWeight: this.apiNumber(weights[index]?.actualWeight ?? 0),
        cl_GoodsValue: '0',
        cl_GoodsDesc: this.apiText(row.description) || this.apiText(details.goodsDescription),
        cl_DTAG: '',
        cl_CRDt: '',
      })),
    };
  }

  private apiNumber(value: unknown): string {
    const number = Number(value);
    return Number.isFinite(number) ? String(this.roundWeight(number)) : '';
  }

  private apiText(value: unknown): string {
    return typeof value === 'string' ? value.trim() : '';
  }

  private responseSucceeded(response: { Code: string; Description: string }): boolean {
    return response.Code === '101' && response.Description?.toUpperCase() === 'SUCCESS';
  }

  private readApiError(error: unknown, fallback: string): string {
    if (error instanceof HttpErrorResponse) {
      const body = error.error as { Description?: string } | null;
      return body?.Description || fallback;
    }
    if (error instanceof Error && error.message) return error.message;
    return fallback;
  }

  private applyAccountDetails(details: CustomerDetails): void {
    this.setIfPristine(this.senderForm.controls.accountName, details.cl_CustName);
    this.setIfPristine(this.senderForm.controls.contactPerson, details.cl_CPerson);
    this.setIfPristine(this.senderForm.controls.addressLine1, details.cl_CustAddress);
    this.setIfPristine(this.senderForm.controls.addressLine2, details.cl_CustAddress1);
    this.setIfPristine(this.senderForm.controls.addressLine3, details.cl_CustAddress2);
    this.setIfPristine(this.senderForm.controls.city, this.cityCode(details.cl_CustCity));
    this.setIfPristine(this.senderForm.controls.phone, details.cl_CustPhone);
    this.setIfPristine(this.senderForm.controls.mobile, details.cl_CustMobile);
    this.setIfPristine(this.senderForm.controls.email, details.cl_CustEMail);
  }

  private cityCode(cityValue: unknown): string {
    if (typeof cityValue !== 'string') return '';
    const normalizedCity = cityValue.trim().toLowerCase();
    const matchedCity = this.cities().find((city) =>
      city.cl_CodeID.trim().toLowerCase() === normalizedCity
      || city.cl_CodeName.trim().toLowerCase() === normalizedCity,
    );
    return matchedCity?.cl_CodeID ?? '';
  }

  private setIfPristine(control: { pristine: boolean; setValue: (value: string) => void }, value: unknown): void {
    if (control.pristine) control.setValue(typeof value === 'string' ? value.trim() : '');
  }

  private localDate(): string {
    const date = new Date();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return date.getFullYear() + '-' + month + '-' + day;
  }
}
