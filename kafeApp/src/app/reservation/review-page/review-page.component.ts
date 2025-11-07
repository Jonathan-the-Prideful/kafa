import { Component, EventEmitter, OnInit, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { AlertController, IonButton, IonCard, IonCardContent, IonCardHeader, IonCardTitle, IonContent, IonItem, IonLabel, IonList, IonToolbar } from '@ionic/angular/standalone';
import { Subscription } from 'rxjs';
import { ReservationCacheService } from 'src/app/services/reservation-cache-service';

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
    IonCardTitle,
    IonCardContent,
    IonList,
    IonItem,
    IonLabel
  ]
})
export class ReviewPageComponent implements OnInit {
  constructor(
    private reservationCacheService: ReservationCacheService,
    private alertCtrl: AlertController
  ) { }

  private sub!: Subscription;

  @Output() reservationConfirmed = new EventEmitter<void>();
  @Output() editReservationEvent = new EventEmitter<void>();
  @Output() cancel = new EventEmitter<void>();

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

  ngOnInit() {
    this.sub = this.reservationCacheService.reservation$.subscribe(data => {
      this.reservationData = data;
    });
  }

  ngOnDestroy() {
    this.sub.unsubscribe();
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

  editReservation() {
    this.editReservationEvent.emit();
  }

  cancelReservation() {
    this.reservationCacheService.clearReservation();
    this.cancel.emit();
  }

}
