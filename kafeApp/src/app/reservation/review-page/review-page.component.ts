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
        console.log('Received reservations:refresh event', payload);
        // Invalidate cache and force refresh
        this.reservationCacheService.invalidateAvailability();

        // Service will update observables automatically
        await this.availabilityService.fetchAvailability(
          this.reservationData.datetime,
          true
        );

        // Check if current reservation is still valid after refresh using cached values
        if (!this.availabilityService.checkReservationAgainstAvailability(
          this.reservationData,
          this.currentAvailabilityData,
          this.currentSeatsLeft
        )) {
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
