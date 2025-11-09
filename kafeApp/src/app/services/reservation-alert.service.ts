import { Injectable } from '@angular/core';
import { AlertController } from '@ionic/angular/standalone';
import { AvailabilityService } from './availability.service';

export interface AlertAlternative {
    label: string;
    targetStep?: number;
    value?: string;
    guests?: number;
    datetime?: string;
}

@Injectable({
    providedIn: 'root',
})
export class ReservationAlertService {
    constructor(
        private alertController: AlertController,
        private availabilityService: AvailabilityService
    ) { }

    /**
     * Show an unavailable alert with suggested alternatives.
     * @param alternatives - Array of suggested alternatives
     * @param onAlternativeSelected - Callback when an alternative is selected
     */
    async showUnavailableAlert(
        alternatives: AlertAlternative[],
        onAlternativeSelected: (alternative: AlertAlternative) => void
    ): Promise<void> {
        let message = 'The selected reservation cannot be accommodated based on current availability.\n\n';

        if (alternatives.length > 0) {
            message += 'Please select an option below:';
        } else {
            message += 'Please try a different date or time.';
        }

        const buttons: any[] = [];

        // Add a button for each alternative
        alternatives.forEach(alt => {
            buttons.push({
                text: alt.label,
                handler: () => {
                    onAlternativeSelected(alt);
                }
            });
        });

        // Add cancel button
        buttons.push({
            text: 'Cancel',
            role: 'cancel'
        });

        const alert = await this.alertController.create({
            header: 'Reservation Unavailable',
            message: message,
            buttons: buttons
        });

        await alert.present();
    }

    /**
     * Show an alert when availability has changed on the review page.
     * @param onEdit - Callback when user chooses to edit reservation
     */
    async showAvailabilityChangedAlert(onEdit: () => void): Promise<void> {
        const alert = await this.alertController.create({
            header: 'Availability Changed',
            message: 'Unfortunately, your reservation can no longer be accommodated. Please review and update your selections.',
            buttons: [
                {
                    text: 'Edit Reservation',
                    handler: () => {
                        onEdit();
                    }
                }
            ],
            backdropDismiss: false
        });

        await alert.present();
    }

    /**
     * Generate suggested alternatives based on current availability.
     * @param reservationData - Current reservation data
     * @param availabilityData - Current availability data from service
     * @param seatsLeft - Current seats left by area
     * @param areaTotals - Total seats by area
     * @returns Array of suggested alternatives
     */
    getSuggestedAlternatives(
        reservationData: any,
        availabilityData: any[],
        seatsLeft: Record<string, number | null>,
        areaTotals: Record<string, number>
    ): AlertAlternative[] {
        const alternatives: AlertAlternative[] = [];
        const requiredSeats = Math.max(1, Math.floor(reservationData.guests || 0));

        // Check if reducing guest count would help
        if (reservationData.guests > 1) {
            // Candidate areas matching current preferences
            const candidateAreas = this.availabilityService.getAvailableSeatingAreas()
                .filter(a => !this.availabilityService.isAreaDisabled(a, reservationData));

            // If a preferred area is set, prefer narrowing to that area first
            let consideredAreas = candidateAreas;
            if (reservationData.preferredArea) {
                const pref = candidateAreas.filter(a => a.value === reservationData.preferredArea);
                if (pref.length > 0) consideredAreas = pref;
            }

            // Compute the maximum available seats among considered areas
            const availabilities = consideredAreas.map(area => seatsLeft[area.value] ?? areaTotals[area.value] ?? 0);
            const maxAvailable = availabilities.length ? Math.max(...availabilities) : 0;

            // Only suggest reducing if it would actually reduce to a smaller number
            if (maxAvailable > 0 && maxAvailable < reservationData.guests) {
                const smallerParty = maxAvailable;
                alternatives.push({
                    label: `Reduce party size to ${smallerParty} guests`,
                    targetStep: 4 // Guests step
                });
            }
        }

        // Check if changing smoking preference would help
        if (reservationData.smoking) {
            const nonSmokingAreas = this.availabilityService.getAvailableSeatingAreas()
                .filter(a => !a.smokingAllowed && reservationData.guests <= a.maxGuests)
                .filter(a => {
                    if (reservationData.children > 0 && a.value === 'Bar') return false;
                    return true;
                });

            const hasNonSmokingAvailability = nonSmokingAreas.some(area => {
                const available = seatsLeft[area.value] ?? areaTotals[area.value] ?? 0;
                return available >= requiredSeats;
            });

            if (hasNonSmokingAvailability) {
                alternatives.push({
                    label: 'Change to non-smoking',
                    targetStep: 6 // Smoking/special requirements step
                });
            }
        }

        // Check if removing children would help (Bar becomes available)
        if (reservationData.children > 0 && reservationData.guests <= 4) {
            const barAvailable = seatsLeft['Bar'] ?? areaTotals['Bar'] ?? 0;
            if (barAvailable >= requiredSeats) {
                alternatives.push({
                    label: 'Book without children (Bar available)',
                    targetStep: 5 // Children step
                });
            }
        }

        // If a preferred area is selected but cannot currently accommodate the party,
        // suggest switching to another area that can accommodate them.
        if (reservationData.preferredArea) {
            const preferred = reservationData.preferredArea;
            const prefConfig = this.availabilityService.getAvailableSeatingAreas()
                .find(a => a.value === preferred);
            let prefAvailable = 0;

            if (prefConfig) {
                if (!this.availabilityService.isAreaDisabled(prefConfig, reservationData)) {
                    const left = seatsLeft[prefConfig.value];
                    prefAvailable = (left ?? areaTotals[prefConfig.value] ?? 0);
                }
            }

            if (prefAvailable < requiredSeats) {
                const otherAreas = this.availabilityService.getAvailableSeatingAreas()
                    .filter(a => a.value !== preferred && !this.availabilityService.isAreaDisabled(a, reservationData));

                const suitable = otherAreas.filter(a => {
                    const left = seatsLeft[a.value] ?? areaTotals[a.value] ?? 0;
                    return left >= requiredSeats;
                });

                // Suggest up to 3 alternative areas. Include the area value so we can prefill it when tapped.
                suitable.slice(0, 3).forEach(a => {
                    alternatives.push({
                        label: `Change preferred area to ${a.label}`,
                        targetStep: 7,
                        value: a.value
                    });
                });
            }
        }

        // Suggest different time slots on same day
        if (availabilityData.length > 0) {
            const currentDateTime = new Date(reservationData.datetime);
            const currentTimeSlot = `${currentDateTime.getHours().toString().padStart(2, '0')}:${currentDateTime.getMinutes().toString().padStart(2, '0')}`;

            const alternativeTimes = this.findAlternativeTimeSlots(
                currentTimeSlot,
                requiredSeats,
                reservationData,
                availabilityData
            );
            if (alternativeTimes.length > 0) {
                alternatives.push({
                    label: `Try different time (${alternativeTimes.slice(0, 2).join(', ')}${alternativeTimes.length > 2 ? '...' : ''})`,
                    targetStep: 0 // Datetime step
                });
            }
        }

        return alternatives;
    }

    /**
     * Find alternative time slots on the same day that can accommodate the reservation.
     * @param currentTimeSlot - Current time slot (e.g., "18:00")
     * @param requiredSeats - Number of seats required
     * @param reservationData - Current reservation data
     * @param availabilityData - Current availability data from service
     * @returns Array of alternative time slots
     */
    private findAlternativeTimeSlots(
        currentTimeSlot: string,
        requiredSeats: number,
        reservationData: any,
        availabilityData: any[]
    ): string[] {
        const alternatives: string[] = [];
        const candidateAreas = this.availabilityService.getAvailableSeatingAreas()
            .filter(a => !this.availabilityService.isAreaDisabled(a, reservationData));

        // Get all possible time slots from availability data
        const allTimeSlots = new Set<string>();
        availabilityData.forEach((areaData: any) => {
            if (areaData.availability) {
                Object.keys(areaData.availability).forEach(slot => allTimeSlots.add(slot));
            }
        });

        // Check each time slot (excluding current one)
        allTimeSlots.forEach(timeSlot => {
            if (timeSlot === currentTimeSlot) return;

            const canAccommodate = candidateAreas.some(area => {
                const areaData = availabilityData.find((a: any) => {
                    const areaNameMap: Record<string, string> = {
                        'Main Hall': 'MainHall',
                        'Bar': 'Bar',
                        'Riverside': 'RiverSide',
                        'Riverside Smoking': 'RiverSideSmoking'
                    };
                    return areaNameMap[a.name] === area.value;
                });

                if (!areaData?.availability?.[timeSlot]) return false;
                return areaData.availability[timeSlot].available >= requiredSeats;
            });

            if (canAccommodate) {
                alternatives.push(timeSlot);
            }
        });

        return alternatives.sort().slice(0, 3); // Return up to 3 alternatives
    }
}
