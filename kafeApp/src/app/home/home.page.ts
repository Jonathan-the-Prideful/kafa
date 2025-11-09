import { Component, ViewChild, ViewContainerRef } from '@angular/core';
import { IonHeader, IonToolbar, IonTitle, IonContent, AlertController } from '@ionic/angular/standalone';
import { ReservationComponent } from '../reservation/reservation.component';
import { SplashComponent } from '../splash/splash.component';
import { ReviewPageComponent } from '../reservation/review-page/review-page.component';
import { ConfirmationPageComponent } from '../reservation/confirmation-page/confirmation-page.component';
import { io } from 'socket.io-client';
import { ReservationCacheService } from '../services/reservation-cache-service';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../environments/environment';

@Component({
  selector: 'app-home',
  templateUrl: 'home.page.html',
  styleUrls: ['home.page.scss'],
  imports: [IonHeader, IonToolbar, IonTitle, IonContent],
})
export class HomePage {
  constructor(private reservationCacheService: ReservationCacheService, private alertCtrl: AlertController) { }
  @ViewChild('dynamicContentContainer', { read: ViewContainerRef }) dynamicContentContainer!: ViewContainerRef;
  public socket = io(environment.socketUrl);

  ngAfterViewInit() {
    this.loadSplash();
  }

  loadSplash(): void {
    this.dynamicContentContainer.clear();
    const splashRef = this.dynamicContentContainer.createComponent(SplashComponent);

    splashRef.instance.startReservation.subscribe(() => {
      this.bookReservation();
    });
  }

  bookReservation(step?: number): void {
    this.dynamicContentContainer.clear();
    const componentRef = this.dynamicContentContainer.createComponent(ReservationComponent);

    // Pass the socket instance to the reservation component for real-time updates
    componentRef.instance.socket = this.socket;

    // Set the starting step if provided
    if (step !== undefined && step >= 0) {
      componentRef.instance.startStep = step;
    }

    componentRef.instance.cancel.subscribe(() => {
      this.reservationCacheService.clearReservation();
      this.loadSplash();
    });

    componentRef.instance.submit.subscribe(() => {
      this.loadReviewComponent();
    });
  }

  loadReviewComponent(): void {
    this.dynamicContentContainer.clear();
    const ref = this.dynamicContentContainer.createComponent(ReviewPageComponent);

    // Pass the socket instance to the review page component for real-time updates
    ref.instance.socket = this.socket;

    ref.instance.editReservationEvent?.subscribe(() => {
      this.bookReservation();
    });

    ref.instance.cancel?.subscribe(() => {
      this.reservationCacheService.clearReservation();
      this.loadSplash();
    });

    ref.instance.editStep?.subscribe((step: number) => {
      this.bookReservation(step);
    });

    ref.instance.reservationConfirmed?.subscribe(async () => {
      try {
        const reservation = await firstValueFrom(this.reservationCacheService.reservation$);
        console.log('emitting reservation via socket', reservation);

        // Use acknowledgement callback to get server response.
        this.socket.emit('reservation:created', reservation, async (ack: any) => {
          try {
            if (ack && ack.ok) {
              // success -> show confirmation
              this.loadConfirmationComponent();
            } else {
              // server returned an error or ack not ok
              const msg = (ack && ack.error) ? String(ack.error) : 'Failed to create reservation on server.';
              const alert = await this.alertCtrl.create({
                header: 'Reservation Failed',
                message: msg,
                buttons: ['OK']
              });
              await alert.present();
            }
          } catch (innerErr) {
            console.error('error handling ack', innerErr);
            const alert = await this.alertCtrl.create({
              header: 'Reservation Error',
              message: 'An unexpected error occurred while processing reservation acknowledgement.',
              buttons: ['OK']
            });
            await alert.present();
          }
        });

      } catch (err) {
        console.error('failed to emit reservation over socket', err);
        const alert = await this.alertCtrl.create({
          header: 'Connection Error',
          message: 'Could not send reservation to server. Please try again later.',
          buttons: ['OK']
        });
        await alert.present();
      }
    });
  }

  loadConfirmationComponent(): void {
    this.dynamicContentContainer.clear();
    const confirmationRef = this.dynamicContentContainer.createComponent(ConfirmationPageComponent);

    confirmationRef.instance.done.subscribe(() => {
      this.loadSplash();
    });
  }

}
