import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { BehaviorSubject, Observable, firstValueFrom } from 'rxjs';
import { ReservationCacheService, ReservationData } from './reservation-cache-service';
import { environment } from '../../environments/environment';

export interface AreaConfig {
    value: string;
    label: string;
    maxGuests: number;
    allowChildren: boolean;
    smokingAllowed: boolean;
}

@Injectable({
    providedIn: 'root',
})
export class AvailabilityService {
    private areaTotals: Record<string, number> = {
        MainHall: 60,
        Bar: 10,
        RiverSide: 20,
        RiverSideSmoking: 10
    };

    // Observable streams
    private availabilityDataSubject = new BehaviorSubject<any[]>([]);
    private seatsLeftSubject = new BehaviorSubject<Record<string, number | null>>({});
    private areaTotalsSubject = new BehaviorSubject<Record<string, number>>(this.areaTotals);

    // Public observables
    availabilityData$ = this.availabilityDataSubject.asObservable();
    seatsLeft$ = this.seatsLeftSubject.asObservable();
    areaTotals$ = this.areaTotalsSubject.asObservable();

    constructor(
        private http: HttpClient,
        private reservationCacheService: ReservationCacheService
    ) { }

    /**
     * Fetch availability from backend for a given date and update observables.
     * Calls /api/availability?date=YYYY-MM-DD and emits to BehaviorSubjects.
     * Uses cached data if available and not expired, unless forceRefresh is true.
     * 
     * @param datetime - The datetime string (YYYY-MM-DDTHH:mm:ss format)
     * @param forceRefresh - If true, bypass cache and fetch fresh data from API
     */
    async fetchAvailability(datetime: string, forceRefresh: boolean = false): Promise<void> {
        if (!datetime) {
            this.availabilityDataSubject.next([]);
            this.seatsLeftSubject.next({});
            return;
        }

        try {
            // Extract date portion (YYYY-MM-DD) from datetime (no timezone conversion)
            const dateStr = datetime.split('T')[0];

            let availabilityData: any[];

            // Try to use cached data first unless force refresh is requested
            if (!forceRefresh) {
                const cached = this.reservationCacheService.getAvailability(dateStr);
                if (cached) {
                    // Use a deep copy to avoid mutating the cached object
                    availabilityData = JSON.parse(JSON.stringify(cached));
                    this.updateObservables(availabilityData, datetime);
                    return;
                }
            }

            // Determine API base depending on runtime environment.
            const url = `${environment.apiUrl}/api/availability?date=${dateStr}`;

            const response = await firstValueFrom(this.http.get<any[]>(url));

            // Ensure we have a fresh copy
            availabilityData = JSON.parse(JSON.stringify(response));

            // Cache the fetched data
            this.reservationCacheService.setAvailability(dateStr, response);

            // Update observables
            this.updateObservables(availabilityData, datetime);
        } catch (err) {
            console.error('Error fetching availability:', err);
            this.availabilityDataSubject.next([]);
            this.seatsLeftSubject.next({});
        }
    }

    /**
     * Update all observables with new availability data.
     */
    private updateObservables(availabilityData: any[], datetime: string): void {
        this.availabilityDataSubject.next(availabilityData);
        const seatsLeft = this.getSeatsLeftFromAvailability(availabilityData, datetime);
        this.seatsLeftSubject.next(seatsLeft);
        this.areaTotalsSubject.next({ ...this.areaTotals });
    }

    /**
     * Check if a reservation can be accommodated based on current availability.
     * 
     * @param reservationData - The reservation data to check
     * @param availabilityData - The availability data for the selected date
     * @param seatsLeft - Current seats left per area
     * @returns True if reservation can be accommodated, false otherwise
     */
    checkReservationAgainstAvailability(
        reservationData: Partial<ReservationData>,
        availabilityData: any[],
        seatsLeft: Record<string, number | null> = {}
    ): boolean {
        if (!reservationData?.datetime) return false;

        const requiredSeats = Math.max(1, Math.floor(reservationData.guests || 0));

        // If preferred area is selected, check if it can accommodate the reservation
        if (reservationData.preferredArea) {
            const preferredAreaConfig = this.getAvailableSeatingAreas().find(
                a => a.value === reservationData.preferredArea
            );

            if (preferredAreaConfig) {
                // Check if preferred area is disabled due to criteria
                if (this.isAreaDisabled(preferredAreaConfig, reservationData)) {
                    return false;
                }

                // Check if preferred area has enough seats
                const left = seatsLeft[preferredAreaConfig.value];
                const total = this.areaTotals[preferredAreaConfig.value] ?? 0;
                const available = (left === null || typeof left === 'undefined') ? total : left;

                return available >= requiredSeats;
            }
        }

        // If no preferred area selected, check if any candidate area has enough seats
        const candidateAreas = this.getAvailableSeatingAreas().filter(
            a => !this.isAreaDisabled(a, reservationData)
        );

        // If no candidate areas remain, reservation can't be honored
        if (!candidateAreas.length) return false;

        // Check if any candidate area has enough seats
        for (const area of candidateAreas) {
            const left = seatsLeft[area.value];
            const total = this.areaTotals[area.value] ?? 0;

            // If seatsLeft is unknown (null), fallback to total capacity as optimistic check
            const available = (left === null || typeof left === 'undefined') ? total : left;

            if (available >= requiredSeats) return true;
        }

        // No area can accommodate the requested number of guests
        return false;
    }

    /**
     * Get seats left for a specific time slot from availability data.
     * 
     * @param availabilityData - The availability data array
     * @param datetime - The datetime to check
     * @returns Record of area keys to available seats
     */
    getSeatsLeftFromAvailability(availabilityData: any[], datetime: string): Record<string, number | null> {
        const seatsLeft: Record<string, number | null> = {};

        if (!availabilityData.length || !datetime) {
            console.warn('Cannot update seats - missing availability data or datetime');
            return seatsLeft;
        }

        // Extract time portion (HH:MM) from datetime
        const dateObj = new Date(datetime);
        const hours = dateObj.getHours().toString().padStart(2, '0');
        const minutes = dateObj.getMinutes().toString().padStart(2, '0');
        const timeSlot = `${hours}:${minutes}`;

        // Map backend area names to frontend area keys
        const areaNameMap: Record<string, string> = {
            'Main Hall': 'MainHall',
            'Bar': 'Bar',
            'Riverside': 'RiverSide',
            'Riverside Smoking': 'RiverSideSmoking'
        };

        availabilityData.forEach(areaData => {
            const frontendKey = areaNameMap[areaData.name];
            if (!frontendKey) {
                console.warn(`Unknown area name from backend: ${areaData.name}`);
                return;
            }

            // Update area capacity from backend data
            if (areaData.capacity) {
                this.areaTotals[frontendKey] = areaData.capacity;
            }

            // Get availability for the selected time slot
            const slotData = areaData.availability?.[timeSlot];

            if (slotData && typeof slotData.available === 'number') {
                seatsLeft[frontendKey] = slotData.available;
            } else {
                console.warn(`No availability data for ${frontendKey} at ${timeSlot}`, {
                    hasAvailability: !!areaData.availability,
                    availableSlots: areaData.availability ? Object.keys(areaData.availability) : []
                });
                seatsLeft[frontendKey] = null;
            }
        });

        return seatsLeft;
    }

    /**
     * Get all available seating areas with their configuration.
     */
    getAvailableSeatingAreas(): AreaConfig[] {
        return [
            { value: 'MainHall', label: 'Main Hall (12 or fewer)', maxGuests: 12, allowChildren: true, smokingAllowed: false },
            { value: 'Bar', label: 'Bar (4 or fewer & no children)', maxGuests: 4, allowChildren: false, smokingAllowed: false },
            { value: 'RiverSide', label: 'RiverSide (8 or fewer)', maxGuests: 8, allowChildren: true, smokingAllowed: false },
            { value: 'RiverSideSmoking', label: 'RiverSide Smoking (6 or fewer & no children)', maxGuests: 6, allowChildren: false, smokingAllowed: true }
        ];
    }

    /**
     * Check if an area is disabled based on reservation criteria.
     */
    isAreaDisabled(area: AreaConfig, reservationData: Partial<ReservationData>): boolean {
        if (reservationData.smoking && !area.smokingAllowed) return true;
        if ((reservationData.children || 0) > 0 && !area.allowChildren) return true;
        if ((reservationData.guests || 0) > area.maxGuests) return true;

        // Also consider current remaining capacity for the area (seats left for the selected time)
        try {
            const requiredSeats = Math.max(1, Math.floor(reservationData.guests || 0));
            const seatsLeft = this.seatsLeftSubject.getValue();
            const left = seatsLeft?.[area.value];
            // If seatsLeft is unknown (null/undefined), fallback to total capacity
            const available = (left === null || typeof left === 'undefined') ? (this.areaTotals[area.value] ?? 0) : left;
            if (requiredSeats > available) return true;
        } catch (e) {
            console.warn('isAreaDisabled: unable to read seatsLeft, falling back to static rules', e);
        }

        return false;
    }

    /**
     * Get area totals (capacity).
     */
    getAreaTotals(): Record<string, number> {
        return { ...this.areaTotals };
    }
}
