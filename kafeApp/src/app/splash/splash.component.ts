import { Component, EventEmitter, OnInit, Output, ViewChild, ViewContainerRef } from '@angular/core';
import { IonButton } from '@ionic/angular/standalone';
import { ReservationComponent } from '../reservation/reservation.component';

@Component({
  selector: 'app-splash',
  templateUrl: './splash.component.html',
  styleUrls: ['./splash.component.scss'],
  imports: [IonButton]
})
export class SplashComponent implements OnInit {
  constructor() { }
  @ViewChild('dynamicContentContainer', { read: ViewContainerRef }) dynamicContentContainer!: ViewContainerRef;

  ngOnInit() { }

  @Output() startReservation = new EventEmitter<void>();

}
