import { Component, ViewChild, ViewContainerRef } from '@angular/core';
import { IonHeader, IonToolbar, IonTitle, IonContent } from '@ionic/angular/standalone';
import { ReservationComponent } from '../reservation/reservation.component';
import { SplashComponent } from '../splash/splash.component';
import { ReviewPageComponent } from '../reservation/review-page/review-page.component';
import { ConfirmationPageComponent } from '../reservation/confirmation-page/confirmation-page.component';

@Component({
  selector: 'app-home',
  templateUrl: 'home.page.html',
  styleUrls: ['home.page.scss'],
  imports: [IonHeader, IonToolbar, IonTitle, IonContent],
})
export class HomePage {
  constructor() { }
  @ViewChild('dynamicContentContainer', { read: ViewContainerRef }) dynamicContentContainer!: ViewContainerRef;

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

  bookReservation(): void {
    this.dynamicContentContainer.clear();
    const componentRef = this.dynamicContentContainer.createComponent(ReservationComponent);

    componentRef.instance.cancel.subscribe(() => {
      this.loadSplash();
    });

    componentRef.instance.submit.subscribe(() => {
      this.loadReviewComponent();
    });
  }

  loadReviewComponent(): void {
    this.dynamicContentContainer.clear();
    const ref = this.dynamicContentContainer.createComponent(ReviewPageComponent);

    ref.instance.editReservationEvent?.subscribe(() => {
      this.bookReservation();
    });

    ref.instance.cancel?.subscribe(() => {
      this.loadSplash();
    });

    ref.instance.reservationConfirmed?.subscribe(() => {
      this.loadConfirmationComponent();
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
