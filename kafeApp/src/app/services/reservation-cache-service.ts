import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';

export interface ReservationData {
  datetime: string;
  name: string;
  email: string;
  phone: string;
  guests: number;
  preferredArea: string;
  children: number;
  smoking: boolean;
  birthday: boolean;
  birthdayGuestName: string;
}

@Injectable({
  providedIn: 'root',
})
export class ReservationCacheService {
  private readonly TTL_MS = 30 * 60 * 1000; // 30 minutes

  private defaultReservation: ReservationData = {
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

  private reservationSubject = new BehaviorSubject<ReservationData>(this.loadInitial());
  reservation$ = this.reservationSubject.asObservable();

  constructor() { }

  private loadInitial(): ReservationData {
    const cached = localStorage.getItem('reservationData');
    if (!cached) return this.defaultReservation;

    try {
      const { data, timestamp } = JSON.parse(cached);

      if (this.isExpired(timestamp)) {
        this.clearReservation();
        return this.defaultReservation;
      }

      return data;
    } catch {
      return this.defaultReservation;
    }
  }

  private isExpired(timestamp: number): boolean {
    const now = Date.now();
    return now - timestamp > this.TTL_MS;
  }

  setReservation(data: Partial<ReservationData>): void {
    const current = this.reservationSubject.getValue();
    const updated = { ...current, ...data }; // merge changes
    const cacheEntry = {
      data: updated,
      timestamp: Date.now()
    };

    this.reservationSubject.next(updated);
    localStorage.setItem('reservationData', JSON.stringify(cacheEntry));
  }

  getReservation(): ReservationData {
    return this.reservationSubject.getValue();
  }

  clearReservation(): void {
    localStorage.removeItem('reservationData');
  }
}
