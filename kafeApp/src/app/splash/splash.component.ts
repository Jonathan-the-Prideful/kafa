import { Component, EventEmitter, OnInit, Output, ViewChild, ViewContainerRef } from '@angular/core';
import { IonButton, IonCard, IonCardContent, IonCardHeader, IonCardSubtitle, IonCardTitle, IonItem, IonLabel, IonList, IonSegment, IonSegmentButton, IonSegmentContent, IonSegmentView } from '@ionic/angular/standalone';
import { ReservationComponent } from '../reservation/reservation.component';

@Component({
  selector: 'app-splash',
  templateUrl: './splash.component.html',
  styleUrls: ['./splash.component.scss'],
  imports: [
    IonButton,
    IonLabel,
    IonList,
    IonItem,
    IonSegment,
    IonSegmentButton,
    IonSegmentView,
    IonSegmentContent,
    IonCard,
    IonCardHeader,
    IonCardTitle,
    IonCardSubtitle,
    IonCardContent
  ]
})
export class SplashComponent implements OnInit {
  constructor() { }
  @ViewChild('dynamicContentContainer', { read: ViewContainerRef }) dynamicContentContainer!: ViewContainerRef;

  ngOnInit() { }

  @Output() startReservation = new EventEmitter<void>();

}
