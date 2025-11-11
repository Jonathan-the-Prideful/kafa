import { Component, EventEmitter, OnInit, OnDestroy, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { AlertController, IonButton, IonCard, IonCardContent, IonCardHeader, IonCardSubtitle, IonCardTitle, IonContent, IonItem, IonLabel, IonList, IonToolbar } from '@ionic/angular/standalone';
import { Observable, Subscription } from 'rxjs';
import { ReservationCacheService } from 'src/app/services/reservation-cache-service';
import { AvailabilityService } from 'src/app/services/availability.service';
import { ReservationAlertService } from 'src/app/services/reservation-alert.service';

@Component({
  selector: 'app-review-page',
  templateUrl: './review-page.component.html',
  styleUrls: ['./review-page.component.scss'],
  imports: [
    CommonModule,
    IonToolbar,
    IonContent,
    IonButton,
    IonCard,
    IonCardHeader,
    IonCardSubtitle,
    IonCardTitle,
    IonCardContent,
    IonList,
    IonItem,
    IonLabel
  ]
})
export class ReviewPageComponent implements OnInit, OnDestroy {
  constructor(
    private reservationCacheService: ReservationCacheService,
    private alertCtrl: AlertController,
    private availabilityService: AvailabilityService,
    private reservationAlertService: ReservationAlertService
  ) { }
  private sub!: Subscription;
  @Output() reservationConfirmed = new EventEmitter<void>();
  @Output() editReservationEvent = new EventEmitter<void>();
  @Output() editStep = new EventEmitter<number>();
  @Output() cancel = new EventEmitter<void>();
  socket: any;

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

  // Observables from service
  availabilityData$!: Observable<any[]>;
  seatsLeft$!: Observable<Record<string, number | null>>;
  areaTotals$!: Observable<Record<string, number>>;

  // Cache current values for methods that need synchronous access
  private currentAvailabilityData: any[] = [];
  private currentSeatsLeft: Record<string, number | null> = {};
  private currentAreaTotals: Record<string, number> = {};

  /**
   * Parse an ISO datetime string but treat the components as literal (do not apply timezone conversion).
   * This ensures we display the same date and hour/minute that are present in the ISO string.
   */
  private parseIsoAsLocal(iso: string): Date {
    if (!iso) return new Date(iso);
    const m = iso.match(/^\s*(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.\d{1,3})?)?/);
    if (m) {
      const year = Number(m[1]);
      const month = Number(m[2]) - 1;
      const day = Number(m[3]);
      const hour = Number(m[4]);
      const minute = Number(m[5]);
      const second = m[6] ? Number(m[6]) : 0;
      return new Date(year, month, day, hour, minute, second);
    }
    return new Date(iso);
  }

  /**
   * Get formatted date string from reservation datetime
   */
  getFormattedDate(): string {
    if (!this.reservationData.datetime) return '';
    const date = this.parseIsoAsLocal(this.reservationData.datetime);
    return date.toLocaleDateString();
  }

  /**
   * Get formatted time string from reservation datetime
   */
  getFormattedTime(): string {
    if (!this.reservationData.datetime) return '';
    const date = this.parseIsoAsLocal(this.reservationData.datetime);
    return date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', hour12: true });
  }

  ngOnInit() {
    // Initialize observables from service
    this.availabilityData$ = this.availabilityService.availabilityData$;
    this.seatsLeft$ = this.availabilityService.seatsLeft$;
    this.areaTotals$ = this.availabilityService.areaTotals$;

    // Subscribe to observables to keep cached values updated
    this.availabilityData$.subscribe(value => this.currentAvailabilityData = value);
    this.seatsLeft$.subscribe(value => this.currentSeatsLeft = value);
    this.areaTotals$.subscribe(value => this.currentAreaTotals = value);

    this.sub = this.reservationCacheService.reservation$.subscribe(data => {
      this.reservationData = data;
    });

    // Set up socket listener for real-time availability updates
    if (this.socket) {
      this.socket.on('reservations:refresh', async (payload: any) => {
        // Invalidate cache and force refresh
        this.reservationCacheService.invalidateAvailability();

        // Fetch availability and wait for it to complete
        await this.availabilityService.fetchAvailability(
          this.reservationData.datetime,
          true
        );

        // Small delay to ensure observables have propagated
        await new Promise(resolve => setTimeout(resolve, 100));

        // Check if current reservation is still valid after refresh
        const isValid = this.availabilityService.checkReservationAgainstAvailability(
          this.reservationData,
          this.currentAvailabilityData,
          this.currentSeatsLeft
        );

        if (!isValid) {
          await this.showUnavailableAlert();
        }
      });
    }
  }

  private async showUnavailableAlert(): Promise<void> {
    // Generate suggestions using the service
    const alternatives = this.reservationAlertService.getSuggestedAlternatives(
      this.reservationData,
      this.currentAvailabilityData,
      this.currentSeatsLeft,
      this.currentAreaTotals
    );

    // Show alert with suggestions
    await this.reservationAlertService.showUnavailableAlert(alternatives, (alternative) => {
      // Navigate to the target step if provided
      if (alternative.targetStep !== undefined) {
        this.editStep.emit(alternative.targetStep);
      } else {
        // Fallback to generic edit if no target step
        this.editReservationEvent.emit();
      }
    });
  }

  ngOnDestroy() {
    this.sub.unsubscribe();

    // Clean up socket listener to prevent orphaned listeners
    if (this.socket) {
      this.socket.off('reservations:refresh');
    }
  }

  async confirmReservation() {
    const alert = await this.alertCtrl.create({
      header: 'Confirm Reservation',
      message: `Submit this reservation?`,
      buttons: [
        { text: 'Cancel', role: 'cancel' },
        {
          text: 'Confirm',
          handler: () => {
            // TODO: Send to API confirmation then navigate to success page
            this.reservationConfirmed.emit();
          },
        },
      ],
    });

    await alert.present();
  }

  editDetail(step: number) {
    this.editStep.emit(step);
  }

  editReservation() {
    this.editReservationEvent.emit();
  }

  cancelReservation() {
    this.reservationCacheService.clearReservation();
    this.cancel.emit();
  }

}
