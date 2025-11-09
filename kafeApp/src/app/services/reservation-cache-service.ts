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

export interface AvailabilityCache {
  date: string; // YYYY-MM-DD
  data: any[];
  timestamp: number;
}

@Injectable({
  providedIn: 'root',
})
export class ReservationCacheService {
  private readonly TTL_MS = 30 * 60 * 1000; // 30 minutes
  private readonly AVAILABILITY_TTL_MS = 2 * 60 * 1000; // 2 minutes for availability

  private defaultReservation: ReservationData = {
    datetime: '2025-07-24T18:00:00', // In normal use this would be current date/time
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

  private availabilitySubject = new BehaviorSubject<AvailabilityCache | null>(this.loadAvailabilityCache());
  availability$ = this.availabilitySubject.asObservable();

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
    this.reservationSubject.next(this.defaultReservation);
  }

  // Availability caching methods
  private loadAvailabilityCache(): AvailabilityCache | null {
    const cached = localStorage.getItem('availabilityData');
    if (!cached) return null;

    try {
      const cache: AvailabilityCache = JSON.parse(cached);
      if (this.isAvailabilityExpired(cache.timestamp)) {
        localStorage.removeItem('availabilityData');
        return null;
      }
      return cache;
    } catch {
      return null;
    }
  }

  private isAvailabilityExpired(timestamp: number): boolean {
    const now = Date.now();
    return now - timestamp > this.AVAILABILITY_TTL_MS;
  }

  setAvailability(date: string, data: any[]): void {
    const cache: AvailabilityCache = {
      date,
      data,
      timestamp: Date.now()
    };
    this.availabilitySubject.next(cache);
    localStorage.setItem('availabilityData', JSON.stringify(cache));
  }

  getAvailability(date: string): any[] | null {
    const cache = this.availabilitySubject.getValue();
    if (!cache || cache.date !== date || this.isAvailabilityExpired(cache.timestamp)) {
      return null;
    }
    return cache.data;
  }

  private clearAvailability(): void {
    localStorage.removeItem('availabilityData');
    this.availabilitySubject.next(null);
  }

  invalidateAvailability(): void {
    this.clearAvailability();
  }
}
