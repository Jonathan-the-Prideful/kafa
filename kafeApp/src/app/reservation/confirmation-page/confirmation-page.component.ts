import { CommonModule } from '@angular/common';
import { Component, EventEmitter, OnInit, Output } from '@angular/core';
import { IonButton, IonCard, IonCardContent, IonCardHeader, IonCardTitle, IonContent, IonToolbar } from '@ionic/angular/standalone';
import { Subscription } from 'rxjs';
import { ReservationCacheService } from 'src/app/services/reservation-cache-service';

@Component({
  selector: 'app-confirmation-page',
  templateUrl: './confirmation-page.component.html',
  styleUrls: ['./confirmation-page.component.scss'],
  imports: [
    CommonModule,
    IonContent,
    IonCard,
    IonCardHeader,
    IonCardTitle,
    IonCardContent,
    IonButton,
    IonToolbar
  ]
})
export class ConfirmationPageComponent implements OnInit {
  constructor(private reservationCache: ReservationCacheService) { }

  @Output() done = new EventEmitter<void>();

  reservation: any = null;
  private sub!: Subscription;

  ngOnInit() {
    this.sub = this.reservationCache.reservation$.subscribe(r => {
      this.reservation = r;
    });
  }

  ngOnDestroy() {
    this.sub.unsubscribe();
  }

  clearReservation(): void {
    this.reservationCache.clearReservation();
    this.reservationCache.invalidateAvailability();
    this.done.emit();
  }


  getFormattedDate(): string {
    if (!this.reservation?.datetime) return '—';
    const d = new Date(this.reservation.datetime);
    return d.toLocaleDateString();
  }

  getFormattedTime(): string {
    if (!this.reservation?.datetime) return '—';
    const d = new Date(this.reservation.datetime);
    return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  }

}
