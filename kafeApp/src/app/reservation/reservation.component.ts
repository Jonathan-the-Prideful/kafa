import { Component, EventEmitter, OnInit, Output, ViewChild, OnDestroy } from '@angular/core';
import { IonButton, IonDatetime, IonInput, IonItem, IonSelect, IonSelectOption, IonToggle, IonCard, IonCardContent, IonCardHeader, IonCardTitle, IonSpinner, AlertController } from '@ionic/angular/standalone';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { Observable, Subscription } from 'rxjs';
import { ReservationCacheService } from '../services/reservation-cache-service';
import { AvailabilityService } from '../services/availability.service';
import { ReservationAlertService } from '../services/reservation-alert.service';
import { environment } from '../../environments/environment';

@Component({
  selector: 'app-reservation',
  templateUrl: './reservation.component.html',
  styleUrls: ['./reservation.component.scss'],
  imports: [
    CommonModule,
    FormsModule,
    IonDatetime,
    IonItem,
    IonInput,
    IonButton,
    IonToggle,
    IonSelect,
    IonSelectOption,
    IonCard,
    IonCardContent,
    IonCardHeader,
    IonCardTitle,
    IonSpinner
  ]
})
export class ReservationComponent implements OnInit, OnDestroy {
  constructor(
    private http: HttpClient,
    private reservationCacheService: ReservationCacheService,
    private alertController: AlertController,
    private availabilityService: AvailabilityService,
    private reservationAlertService: ReservationAlertService
  ) { }
  private reservationSubscription!: Subscription;
  private socketSubscription: any; // Will hold socket event listener cleanup
  @ViewChild(IonDatetime) datetimePicker!: IonDatetime;
  @Output() cancel = new EventEmitter<void>();
  @Output() submit = new EventEmitter<void>();
  socket: any;

  currentStep = 0;
  totalSteps = 8;
  startStep = 0; // Starting step can be set from parent component

  reservationData = {
    datetime: '2025-07-24T18:00:00',
    name: '',
    email: '',
    phone: '',
    guests: 1,
    preferredArea: '',
    children: 0,
    smoking: false,
    birthday: false,
    birthdayGuestName: ''
  };

  minuteValues: number[] = [0, 30];

  // Observables from service
  seatsLeft$!: Observable<Record<string, number | null>>;
  availabilityData$!: Observable<any[]>;
  areaTotals$!: Observable<Record<string, number>>;

  seatsLoading: Record<string, boolean> = {};

  // Cache current values for methods that need synchronous access
  private currentSeatsLeft: Record<string, number | null> = {};
  private currentAvailabilityData: any[] = [];
  private currentAreaTotals: Record<string, number> = {};

  ngOnInit() {
    // Initialize observables from service
    this.seatsLeft$ = this.availabilityService.seatsLeft$;
    this.availabilityData$ = this.availabilityService.availabilityData$;
    this.areaTotals$ = this.availabilityService.areaTotals$;

    // Subscribe to observables to keep cached values updated for synchronous methods
    this.seatsLeft$.subscribe(value => this.currentSeatsLeft = value);
    this.availabilityData$.subscribe(value => this.currentAvailabilityData = value);
    this.areaTotals$.subscribe(value => this.currentAreaTotals = value);

    // Set the starting step if provided
    if (this.startStep >= 0 && this.startStep < this.totalSteps) {
      this.currentStep = this.startStep;
    }

    // Load cached reservation data and merge with defaults
    const cachedData = this.reservationCacheService.getReservation();
    if (cachedData) {
      this.reservationData = { ...this.reservationData, ...cachedData };
    }

    this.updateMinuteValues();

    // Subscribe to future changes
    this.reservationSubscription = this.reservationCacheService.reservation$.subscribe(data => {
      this.reservationData = { ...this.reservationData, ...data };
      this.updateMinuteValues();
    });

    // Set up socket listener for real-time availability updates
    if (this.socket) {
      this.socket.on('reservations:refresh', async (payload: any) => {
        // Invalidate cache and force refresh
        this.reservationCacheService.invalidateAvailability();

        // Service will update observables automatically
        try {
          await this.availabilityService.fetchAvailability(
            this.reservationData.datetime,
            true
          );
        } catch (err) {
          console.error('Error during fetchAvailability:', err);
        }

        // Check if current reservation is still valid after refresh
        this.availabilityData$.subscribe(availabilityData => {
          this.seatsLeft$.subscribe(seatsLeft => {
            const isValid = this.availabilityService.checkReservationAgainstAvailability(
              this.reservationData,
              availabilityData,
              seatsLeft
            );

            if (!isValid) {
              this.showUnavailableAlert();
            }
          }).unsubscribe();
        }).unsubscribe();
      });
    }

    // Fetch availability on component initialization
    if (this.reservationData.datetime) {
      this.availabilityService.fetchAvailability(this.reservationData.datetime);
    }
  }

  ngOnDestroy() {
    this.reservationSubscription.unsubscribe();

    // Clean up socket listener
    if (this.socket) {
      this.socket.off('reservations:refresh');
    }
  }

  updateMinuteValues(): void {
    const datetime = new Date(this.reservationData.datetime);
    const hour = datetime.getHours();

    if (hour === 22) {
      this.minuteValues = [0];
      // If 22:30 is selected, adjust to 22:00 since only that slot is available
      if (datetime.getMinutes() === 30) {
        const newDate = new Date(datetime);
        newDate.setMinutes(0);
        this.reservationData.datetime = this.formatLocalDatetime(newDate);
      }
    } else {
      this.minuteValues = [0, 30];
    }
  }

  /**
   * Format a Date into a string acceptable for ion-datetime but keep local time components.
   * Returns "YYYY-MM-DDTHH:mm:00" (no timezone suffix) which matches what the template expects.
   */
  private formatLocalDatetime(d: Date): string {
    const pad = (n: number) => n.toString().padStart(2, '0');
    const year = d.getFullYear();
    const month = pad(d.getMonth() + 1);
    const day = pad(d.getDate());
    const hour = pad(d.getHours());
    const minute = pad(d.getMinutes());
    return `${year}-${month}-${day}T${hour}:${minute}:00`;
  }

  onDatetimeChange(): void {
    this.updateMinuteValues();
    if (this.reservationData.datetime) {
      this.availabilityService.fetchAvailability(this.reservationData.datetime);
    }
    this.reservationCacheService.setReservation({ datetime: this.reservationData.datetime });
  }

  isDateAvailable = (date: string): boolean => {
    const disabledDates = ['2025-07-26'];
    return !disabledDates.includes(date);
  }

  isAreaDisabled(area: any): boolean {
    return this.availabilityService.isAreaDisabled(area, this.reservationData);
  }

  // Helper method for synchronous access to seats left
  getSeatsLeft(areaValue: string): number | null {
    return this.currentSeatsLeft[areaValue] ?? null;
  }

  getChildrenOptions(): number[] {
    const max = Math.max(0, Math.floor(this.reservationData.guests || 0));
    return Array.from({ length: max + 1 }, (_, i) => i);
  }

  onGuestsChange(): void {
    if (this.reservationData.children > this.reservationData.guests) {
      this.reservationData.children = this.reservationData.guests;
    }
    this.ensurePreferredAreaValid();
  }

  onChildrenChange(): void {
    this.ensurePreferredAreaValid();
  }

  onSmokingChange(): void {
    this.ensurePreferredAreaValid();
  }

  ensurePreferredAreaValid(): void {
    const pref = this.reservationData.preferredArea;
    if (!pref) return;

    const areas = this.getAvailableSeatingAreas();
    const area = areas.find(a => a.value === pref);

    if (!area || this.availabilityService.isAreaDisabled(area, this.reservationData)) {
      this.reservationData.preferredArea = '';
    }
  }

  getAvailableSeatingAreas() {
    return this.availabilityService.getAvailableSeatingAreas();
  }

  canGoNext(): boolean {
    switch (this.currentStep) {
      case 0: return !!this.reservationData.datetime;
      case 1: return !!this.reservationData.name.trim();
      case 2: return this.isValidEmail(this.reservationData.email);
      case 3: return this.isValidPhone(this.reservationData.phone);
      case 4: return this.reservationData.guests > 0;
      case 5: return true; // children count
      case 6: return true; // smoking and birthday
      case 7: return !!this.reservationData.preferredArea;
      default: return false;
    }
  }

  isValidEmail(email: string): boolean {
    const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailPattern.test(email);
  }

  isValidPhone(phone: string): boolean {
    const digits = phone.replace(/\D/g, '');
    return digits.length >= 10 && digits.length <= 15;
  }

  async nextStep(): Promise<void> {
    if (this.currentStep < this.totalSteps - 1) {
      if (this.canGoNext()) {
        // Check for duplicate booking after phone number is entered (step 3)
        if (this.currentStep === 3) {
          const hasDuplicate = await this.checkForDuplicateBooking();
          if (hasDuplicate) {
            return; // Don't proceed if duplicate found
          }
        }

        if (this.shouldCheckAvailability()) {
          if (!this.checkReservationAgainstAvailability()) {
            this.showUnavailableAlert();
            return;
          }
        }
        this.persistCurrentStepData();
        this.currentStep++;
      }
    }
  }

  previousStep(): void {
    if (this.currentStep > 0) {
      this.currentStep--;

      // Restore datetime picker state when navigating back to step 0
      if (this.currentStep === 0 && this.reservationData?.datetime) {
        this.reservationData.datetime = this.formatLocalDatetime(new Date(this.reservationData.datetime));
        this.updateMinuteValues();

        // Update IonDatetime component after DOM renders
        setTimeout(() => {
          if (this.datetimePicker) {
            this.datetimePicker.value = this.reservationData.datetime;
            this.datetimePicker.reset(this.reservationData.datetime);
          }
        }, 0);
      }
    }
  }

  private shouldCheckAvailability(): boolean {
    return this.currentStep === 0 ||
      this.currentStep === 4 ||
      this.currentStep === 5 ||
      this.currentStep === 6;
  }

  private checkReservationAgainstAvailability(): boolean {
    return this.availabilityService.checkReservationAgainstAvailability(
      this.reservationData,
      this.currentAvailabilityData,
      this.currentSeatsLeft
    );
  }

  /**
   * Check if user has a duplicate/overlapping booking.
   * @returns Promise<boolean> - true if duplicate found, false otherwise
   */
  private async checkForDuplicateBooking(): Promise<boolean> {
    try {
      const params = {
        email: this.reservationData.email,
        phone: this.reservationData.phone,
        datetime: this.reservationData.datetime
      };

      const response = await this.http.get<any>(`${environment.apiUrl}/api/booking/check-duplicate`, {
        params: params
      }).toPromise();

      if (response?.duplicate) {
        // Show alert about duplicate booking
        await this.showDuplicateBookingAlert(response);
        return true;
      }

      return false;
    } catch (err) {
      console.error('Error checking for duplicate booking:', err);
      // If check fails, allow user to proceed (don't block on network error)
      return false;
    }
  }

  /**
   * Show alert when user has a duplicate/overlapping booking.
   */
  private async showDuplicateBookingAlert(duplicateInfo: any): Promise<void> {
    const conflicting = duplicateInfo.conflictingReservation;
    const matchedBy = duplicateInfo.matchedBy;

    const conflictDate = new Date(conflicting.datetime);
    const formattedDate = conflictDate.toLocaleDateString();
    const formattedTime = conflictDate.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });

    const message = `You already have a reservation on ${formattedDate} at ${formattedTime} for ${conflicting.guests} guest(s).\n\n` +
      `This was matched by your ${matchedBy}.\n\n` +
      `Reservations are 2 hours long and cannot overlap. Please select a different date and time.`;

    const alert = await this.alertController.create({
      header: 'Duplicate Booking Found',
      message: message,
      buttons: [
        {
          text: 'Change Date/Time',
          handler: () => {
            this.currentStep = 0; // Go back to datetime selection
          }
        },
        {
          text: 'Cancel',
          role: 'cancel'
        }
      ],
      backdropDismiss: false
    });

    await alert.present();
  }

  private persistCurrentStepData(): void {
    // Save current form data to cache when navigating between steps
    switch (this.currentStep) {
      case 0:
        this.reservationCacheService.setReservation({ datetime: this.reservationData.datetime });
        break;
      case 1:
        this.reservationCacheService.setReservation({ name: this.reservationData.name });
        break;
      case 2:
        this.reservationCacheService.setReservation({ email: this.reservationData.email });
        break;
      case 3:
        this.reservationCacheService.setReservation({ phone: this.reservationData.phone });
        break;
      case 4:
        this.reservationCacheService.setReservation({ guests: this.reservationData.guests });
        break;
      case 5:
        this.reservationCacheService.setReservation({ children: this.reservationData.children });
        break;
      case 6:
        this.reservationCacheService.setReservation({
          smoking: this.reservationData.smoking,
          birthday: this.reservationData.birthday,
          birthdayGuestName: this.reservationData.birthdayGuestName
        });
        break;
      case 7:
        this.reservationCacheService.setReservation({ preferredArea: this.reservationData.preferredArea });
        break;
    }
  }

  private async showValidationAlert(message: string): Promise<void> {
    const alert = await this.alertController.create({
      header: 'Incomplete Information',
      message: message,
      buttons: ['OK']
    });
    await alert.present();
  }

  /**
  * Show alert when reservation cannot be accommodated with suggested alternatives.
  */
  async showUnavailableAlert(): Promise<void> {
    const alternatives = this.reservationAlertService.getSuggestedAlternatives(
      this.reservationData,
      this.currentAvailabilityData,
      this.currentSeatsLeft,
      this.currentAreaTotals
    );

    await this.reservationAlertService.showUnavailableAlert(alternatives, (alternative) => {
      // If the alternative carries a preferred area value, prefill it
      if (alternative.value) {
        this.reservationData.preferredArea = alternative.value;
        // persist to cache so the selection survives navigation
        this.reservationCacheService.setReservation({ preferredArea: this.reservationData.preferredArea });
      }

      // Navigate to the target step if provided
      if (alternative.targetStep !== undefined) {
        this.currentStep = alternative.targetStep;
      }
    });
  }

  isFormValid(): boolean {
    return this.reservationData.name.trim() !== '' &&
      this.isValidEmail(this.reservationData.email) &&
      this.isValidPhone(this.reservationData.phone) &&
      this.reservationData.guests > 0 &&
      this.reservationData.preferredArea !== '';
  }

  onSubmit(): void {
    if (!this.isFormValid()) {
      this.showValidationAlert('Please complete all required fields.');
      return;
    }

    if (!this.checkReservationAgainstAvailability()) {
      this.showUnavailableAlert();
      return;
    }

    this.reservationCacheService.setReservation(this.reservationData);
    this.submit.emit();
  }

  onCancel(): void {
    this.cancel.emit();
  }

}
