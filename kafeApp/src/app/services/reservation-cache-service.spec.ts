import { TestBed } from '@angular/core/testing';

import { ReservationCacheService } from './reservation-cache-service';

describe('ReservationCacheService', () => {
  let service: ReservationCacheService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(ReservationCacheService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
