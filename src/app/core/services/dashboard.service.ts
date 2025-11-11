import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable, of } from 'rxjs';
import { tap } from 'rxjs/operators';
import { environment } from '../../../environments/environment';

export interface DashboardStats {
  totalPatients: number;
  todayPatients: number;
  monthlyPatients: number;
  todayAppointments: number;
  ipdPatients: number;
  todayOPD: number;
  totalOPD: number;
  totalRegistrations: number;
  todayRegistrations: number;

  todayRevenue: number;
  totalRevenue: number;
  labRevenue: number;

  labReports: number;
}

export interface PatientTrend {
  date: string;
  count: number;
  label: string;
}

export interface WeatherData {
  temperature: number;
  condition: string;
  icon: string;
  greeting: string;
}

export interface RecentActivity {
  id: string;
  time: string;
  activity: string;
  patientName: string;
  type: string;
  department?: string;
}

@Injectable({
  providedIn: 'root'
})
export class DashboardService {
  private apiUrl = environment.apiUrl;
  private cachedStats: any = null;
  private lastStatsUpdate: number = 0;
  private cacheTimeout = 30000; // 30 seconds cache

  // Store last known good data
  private lastKnownStats: DashboardStats = {
    totalPatients: 0,
    todayPatients: 0,
    monthlyPatients: 0,
    todayAppointments: 0,
    ipdPatients: 0,
    todayOPD: 0,
    totalOPD: 0,
    totalRegistrations: 0,
    todayRegistrations: 0,
    todayRevenue: 0,
    totalRevenue: 0,
    labRevenue: 0,

    labReports: 0
  };

  // Weather caching (avoid randomness; reuse last known value on error)
  private lastWeather?: WeatherData;
  private lastWeatherAt: number = 0;
  private weatherTTL: number = 10 * 60 * 1000; // 10 minutes

  constructor(private http: HttpClient) {}

  getDashboardStats(): Observable<DashboardStats> {
    console.log('📊 Fetching dashboard stats');
    return this.http.get<DashboardStats>(`${this.apiUrl}/dashboard/stats`).pipe(
      tap((stats) => {
        console.log('📊 Dashboard stats loaded:', stats);
      })
    );
  }

  getPatientTrends(period: 'daily' | 'monthly' = 'daily'): Observable<PatientTrend[]> {
    const headers = new HttpHeaders({ 'Cache-Control': 'no-cache', 'Pragma': 'no-cache', 'Expires': '0' });
    return this.http.get<PatientTrend[]>(`${this.apiUrl}/dashboard/patient-trends?period=${period}&_=${Date.now()}`,{ headers });
  }

  getOPDTrends(
    period: 'daily' | 'monthly' = 'daily',
    offset: number = 0,
    windowSize?: number
  ): Observable<PatientTrend[]> {
    const headers = new HttpHeaders({ 'Cache-Control': 'no-cache', 'Pragma': 'no-cache', 'Expires': '0' });
    const defaultWindow = period === 'daily' ? 7 : 6;
    const qs = `period=${period}&offset=${Math.max(0, offset)}&window=${windowSize ?? defaultWindow}&_=${Date.now()}`;
    return this.http.get<PatientTrend[]>(`${this.apiUrl}/dashboard/opd-trends?${qs}`, { headers });
  }


  // Option B: backend-powered multi-series trends (registrations, followUps, receipts, revenue)
  getUnifiedTrends(period: 'daily' | 'monthly' = 'daily'): Observable<any> {
    const headers = new HttpHeaders({ 'Cache-Control': 'no-cache', 'Pragma': 'no-cache', 'Expires': '0' });
    return this.http.get<any>(`${this.apiUrl}/dashboard/trends?period=${period}&_=${Date.now()}`, { headers });
  }


  getRecentActivities(): Observable<RecentActivity[]> {
    return this.http.get<RecentActivity[]>(`${this.apiUrl}/dashboard/recent-activities`);
  }

  getTodaysPatients(): Observable<any[]> {
    return this.http.get<any[]>(`${this.apiUrl}/dashboard/todays-patients`);
  }

  getCurrentDateTime() {
    const now = new Date();
    return {
      date: now.toLocaleDateString('en-US', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric'
      }),
      time: now.toLocaleTimeString('en-US', {
        hour: '2-digit',
        minute: '2-digit',
        hour12: true
      }),
      greeting: this.getTimeBasedGreeting(now.getHours())
    };
  }

  private getTimeBasedGreeting(hour: number): string {
    if (hour >= 5 && hour < 12) {
      return 'Good Morning';
    } else if (hour >= 12 && hour < 17) {
      return 'Good Afternoon';
    } else if (hour >= 17 && hour < 21) {
      return 'Good Evening';
    } else {
      return 'Good Night';
    }
  }

  // Live weather using Open-Meteo (no API key). Caches and reuses last known value; no randomness.
  getWeatherData(lat?: number, lon?: number, force: boolean = false): Observable<WeatherData> {
    const now = Date.now();
    if (!force && this.lastWeather && (now - this.lastWeatherAt) < this.weatherTTL) {
      return of(this.lastWeather);
    }

    // Default to Varanasi if geolocation not available
    const latitude = (typeof lat === 'number') ? lat : 25.3176;
    const longitude = (typeof lon === 'number') ? lon : 82.9739;
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current=temperature_2m,weather_code,is_day&timezone=auto&_=${now}`;

    return this.http.get<any>(url, { headers: new HttpHeaders({ 'Cache-Control': 'no-cache' }) }).pipe(
      tap(() => {}),
      (source => new Observable<WeatherData>(observer => {
        source.subscribe({
          next: (res: any) => {
            const temp = Number(res?.current?.temperature_2m ?? NaN);
            const code = Number(res?.current?.weather_code ?? NaN);
            const isDay = Number(res?.current?.is_day ?? 1) === 1;
            const { condition, icon } = this.mapWeatherCode(code, isDay);
            const data: WeatherData = {
              temperature: isNaN(temp) ? (this.lastWeather?.temperature ?? 26) : Math.round(temp),
              condition: condition || this.lastWeather?.condition || 'Clear',
              icon: icon || this.lastWeather?.icon || '☀️',
              greeting: this.getCurrentDateTime().greeting
            };
            this.lastWeather = data;
            this.lastWeatherAt = now;
            observer.next(data);
            observer.complete();
          },
          error: () => {
            if (this.lastWeather) {
              observer.next(this.lastWeather);
            } else {
              observer.next({ temperature: 26, condition: 'Clear', icon: '☀️', greeting: this.getCurrentDateTime().greeting });
            }
            observer.complete();
          }
        });
      }))
    );
  }

  private mapWeatherCode(code: number, isDay: boolean = true): { condition: string; icon: string } {
    // 0: Clear, 1-3: Mainly clear/partly cloudy, 45/48: Fog, 51-57: Drizzle, 61-67: Rain, 71-77: Snow, 80-82: Rain showers, 95-99: Thunderstorm
    if (code === 0) return { condition: 'Clear', icon: isDay ? '☀️' : '🌙' };
    if (code >= 1 && code <= 3) return { condition: 'Partly Cloudy', icon: isDay ? '⛅' : '☁️' };
    if (code === 45 || code === 48) return { condition: 'Fog', icon: '🌫️' };
    if ((code >= 51 && code <= 57) || (code >= 61 && code <= 67)) return { condition: 'Rain', icon: '🌧️' };
    if (code >= 71 && code <= 77) return { condition: 'Snow', icon: '❄️' };
    if (code >= 80 && code <= 82) return { condition: 'Showers', icon: '🌦️' };
    if (code >= 95 && code <= 99) return { condition: 'Thunderstorm', icon: '⛈️' };
    return { condition: 'Clear', icon: isDay ? '☀️' : '🌙' };
  }
}
