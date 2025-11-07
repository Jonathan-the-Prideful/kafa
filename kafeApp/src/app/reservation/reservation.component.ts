import { Component, EventEmitter, OnInit, Output } from '@angular/core';
import { IonButton, IonDatetime, IonInput, IonItem, IonSelect, IonSelectOption, IonToggle, IonCard, IonCardContent, IonCardHeader, IonCardTitle, IonSpinner } from '@ionic/angular/standalone';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom, Subscription } from 'rxjs';
import { ReservationCacheService } from '../services/reservation-cache-service';

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
export class ReservationComponent implements OnInit {
  constructor(private http: HttpClient, private reservationCacheService: ReservationCacheService) { }
  private reservationSubscription!: Subscription;
  @Output() cancel = new EventEmitter<void>();
  @Output() submit = new EventEmitter<void>();

  currentStep = 0;
  totalSteps = 8;

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

  seatsLeft: Record<string, number | null> = {};
  seatsLoading: Record<string, boolean> = {};

  areaTotals: Record<string, number> = {
    MainHall: 60,
    Bar: 10,
    RiverSide: 20,
    RiverSideSmoking: 10
  };

  ngOnInit() {
    this.reservationSubscription = this.reservationCacheService.reservation$.subscribe(data => {
      this.reservationData = data;
    });
    this.fetchAllSeatsLeft();
  }

  ngOnDestroy() {
    this.reservationSubscription.unsubscribe();
  }

  updateMinuteValues(): void {
    const datetime = new Date(this.reservationData.datetime);
    const hour = datetime.getHours();

    if (hour === 22) {
      this.minuteValues = [0];
      if (datetime.getMinutes() === 30) {
        const newDate = new Date(datetime);
        newDate.setMinutes(0);
        this.reservationData.datetime = newDate.toISOString().slice(0, 19);
      }
    } else {
      this.minuteValues = [0, 30];
    }
  }

  onDatetimeChange(): void {
    this.updateMinuteValues();
    this.fetchAllSeatsLeft();
  }

  isDateAvailable = (date: string): boolean => {
    // We will call the backend to check if there is availability on the selected date and it is not fully reserved.
    const disabledDates = [
      '2025-07-26',
    ];
    return !disabledDates.includes(date);
  }

  async getTakenSeats(areaValue: string): Promise<number> {
    if (!this.reservationData?.datetime) return 0;
    const payload = {
      datetime: this.reservationData.datetime,
      area: areaValue
    };
    const url = 'https://localHost.com:5000/api/reservations/taken-seats';
    try {
      const resp = await firstValueFrom(this.http.post<{ taken: number }>(url, payload));
      return (resp && typeof resp.taken === 'number') ? resp.taken : 0;
    } catch (err) {
      console.error('getTakenSeats error', err);
      return 0;
    }
  }

  // fetch seats left for a single area and cache the result
  async fetchSeatsLeft(areaValue: string): Promise<void> {
    this.seatsLoading[areaValue] = true;
    try {
      const taken = await this.getTakenSeats(areaValue);
      const total = this.areaTotals[areaValue] ?? 0;
      this.seatsLeft[areaValue] = Math.max(0, total - taken);
    } catch (err) {
      console.error('fetchSeatsLeft error', err);
      this.seatsLeft[areaValue] = null;
    } finally {
      this.seatsLoading[areaValue] = false;
    }
  }

  // convenience to refresh all known areas
  fetchAllSeatsLeft(): void {
    Object.keys(this.areaTotals).forEach(area => {
      // start each fetch but don't await here
      this.fetchSeatsLeft(area);
    });
  }

  // synchronous getter used by template (returns cached value or null)
  getSeatsLeft(areaValue: string): number | null {
    return this.seatsLeft[areaValue] ?? null;
  }

  // return possible children counts: 0 .. guests
  getChildrenOptions(): number[] {
    const max = Math.max(0, Math.floor(this.reservationData.guests || 0));
    return Array.from({ length: max + 1 }, (_, i) => i);
  }

  // ensure children count never exceeds guests (call from guests select ionChange)
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
    // If the area is missing (shouldn't happen) or is now disabled, clear selection
    if (!area || this.isAreaDisabled(area)) {
      this.reservationData.preferredArea = '';
    }
  }

  getAvailableSeatingAreas() {
    // always return full canonical list so we can render all options,
    // then disable invalid ones via isAreaDisabled()
    return [
      { value: 'MainHall', label: 'Main Hall (12 or fewer)', maxGuests: 12, allowChildren: true, smokingAllowed: false },
      { value: 'Bar', label: 'Bar (4 or fewer & no children)', maxGuests: 4, allowChildren: false, smokingAllowed: false },
      { value: 'RiverSide', label: 'RiverSide (8 or fewer)', maxGuests: 8, allowChildren: true, smokingAllowed: false },
      { value: 'RiverSideSmoking', label: 'RiverSide Smoking (6 or fewer)', maxGuests: 6, allowChildren: true, smokingAllowed: true }
    ];
  }

  // determine whether the given area should be disabled based on current selections
  isAreaDisabled(area: { value: string; maxGuests: number; allowChildren: boolean; smokingAllowed: boolean }): boolean {
    // if guest requires smoking, disable areas that don't allow smoking
    if (this.reservationData.smoking && !area.smokingAllowed) {
      return true;
    }

    // parties with children are not allowed at the Bar
    if (this.reservationData.children > 0 && area.value === 'Bar') {
      return true;
    }

    // party too large for area
    if (this.reservationData.guests > area.maxGuests) {
      return true;
    }

    return false;
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

  nextStep(): void {
    if (this.canGoNext() && this.currentStep < this.totalSteps - 1) {
      this.currentStep++;
    }
  }

  previousStep(): void {
    if (this.currentStep > 0) {
      this.currentStep--;
    }
  }

  isFormValid(): boolean {
    return this.reservationData.name.trim() !== '' &&
      this.isValidEmail(this.reservationData.email) &&
      this.isValidPhone(this.reservationData.phone) &&
      this.reservationData.guests > 0 &&
      this.reservationData.preferredArea !== '';
  }

  onSubmit(): void {
    if (this.isFormValid()) {
      console.log('Reservation submitted:', this.reservationData);
      this.reservationCacheService.setReservation(this.reservationData);
      // TODO: Send to backend to place an unconfirmed reservation
      this.submit.emit();
    }
  }

  onCancel(): void {
    this.cancel.emit();
  }

}
