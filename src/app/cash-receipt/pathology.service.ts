import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { environment } from '../../environments/environment';

export interface PathologyTest {
  _id?: string;
  testId?: string;
  patient: string;
  doctor: string;
  testType: 'Blood Test' | 'Urine Test' | 'Stool Test' | 'Sputum Test' | 'Biopsy' | 'Culture' | 'Other';
  testName: string;
  testCategory: string;
  sampleType: string;
  collectionDate: Date;
  reportDate?: Date;
  status: 'Pending' | 'Sample Collected' | 'In Progress' | 'Completed' | 'Reported';
  mode: 'OPD' | 'IPD' | 'Emergency';
  clinicalHistory?: string;
  testParameters: TestParameter[];
  results?: TestResult[];
  interpretation?: string;
  recommendations?: string;
  technician?: string;
  pathologist?: string;
  doctorRefNo?: string;
  cost: number;
  isPaid: boolean;
}

export interface TestParameter {
  parameterName: string;
  normalRange: string;
  unit: string;
  isRequired: boolean;
}

export interface TestInfo {
  testName: string;
  testType: string;
  price: number;
  description?: string;
  parameters: TestParameter[];
}

export interface TestResult {
  parameterName: string;
  value: string;
  unit: string;
  normalRange: string;
  status: 'Normal' | 'Abnormal' | 'Critical';
  flag?: string;
}

export interface Patient {
  _id: string;
  patientId: string;
  firstName: string;
  lastName: string;
  age: number;
  gender: string;
  contact: string;
}

export interface Doctor {
  _id: string;
  doctorId: string;
  firstName: string;
  lastName: string;
  specialization: string;
  department: string | { _id: string; name: string; code?: string };
}

@Injectable({
  providedIn: 'root'
})
export class PathologyService {
  private apiUrl = environment.apiUrl;

  constructor(private http: HttpClient) { }

  // Get all pathology tests
  getAllTests(): Observable<PathologyTest[]> {
    return this.http.get<PathologyTest[]>(`${this.apiUrl}/pathology`);
  }

  // Get test by ID
  getTestById(id: string): Observable<PathologyTest> {
    return this.http.get<PathologyTest>(`${this.apiUrl}/pathology/${id}`);
  }

  // Create new pathology test
  createTest(test: Partial<PathologyTest>): Observable<PathologyTest> {
    return this.http.post<PathologyTest>(`${this.apiUrl}/pathology`, test);
  }

  // Update pathology test
  updateTest(id: string, test: Partial<PathologyTest>): Observable<PathologyTest> {
    return this.http.put<PathologyTest>(`${this.apiUrl}/pathology/${id}`, test);
  }

  // Delete pathology test
  deleteTest(id: string): Observable<void> {
    return this.http.delete<void>(`${this.apiUrl}/pathology/${id}`);
  }

  // Get patients for dropdown (handles both array and {patients: []} responses)
  getPatients(): Observable<Patient[]> {
    return this.http.get<any>(`${this.apiUrl}/patients/list`).pipe(
      map((res: any) => Array.isArray(res) ? res : (res?.patients || []))
    );
  }

  // Get doctors for dropdown
  getDoctors(): Observable<Doctor[]> {
    return this.http.get<Doctor[]>(`${this.apiUrl}/doctors`);
  }

  // Search patients (backend uses /patients/list with ?search=)
  searchPatients(searchTerm: string): Observable<Patient[]> {
    const url = `${this.apiUrl}/patients/list?search=${encodeURIComponent(searchTerm)}`;
    return this.http.get<any>(url).pipe(
      map((res: any) => Array.isArray(res) ? res : (res?.patients || []))
    );
  }

  // Get test templates/categories
  getTestCategories(): Observable<string[]> {
    // Mock data for testing
    const mockCategories = [
      'Hematology',
      'Biochemistry',
      'Microbiology',
      'Immunology',
      'Histopathology',
      'Cytology'
    ];
    return new Observable(observer => {
      observer.next(mockCategories);
      observer.complete();
    });
    // return this.http.get<string[]>(`${this.apiUrl}/pathology/categories`);
  }

  // Get test parameters by test name
  getTestParameters(testName: string): Observable<TestParameter[]> {
    // Mock data for testing
    const mockParameters: TestParameter[] = [
      { parameterName: 'Hemoglobin', normalRange: '12-16 g/dL', unit: 'g/dL', isRequired: true },
      { parameterName: 'WBC Count', normalRange: '4000-11000 /μL', unit: '/μL', isRequired: true },
      { parameterName: 'Platelet Count', normalRange: '150000-450000 /μL', unit: '/μL', isRequired: false }
    ];
    return new Observable(observer => {
      observer.next(mockParameters);
      observer.complete();
    });
    // return this.http.get<TestParameter[]>(`${this.apiUrl}/pathology/parameters/${testName}`);
  }

  // Get test types by category
  getTestTypesByCategory(category: string): Observable<string[]> {
    const categoryTestTypes: { [key: string]: string[] } = {
      'PATHOLOGY': [
        'Blood Test',
        'Urine Test',
        'Stool Test',
        'Sputum Test',
        'Biopsy',
        'Culture'
      ],
      'X-RAY': [
        'Chest X-Ray',
        'Bone X-Ray',
        'Abdominal X-Ray',
        'Dental X-Ray'
      ],
      'ECG': [
        'Resting ECG',
        'Stress ECG',
        'Holter Monitor'
      ],
      'SHALAKYA': [
        'Eye Examination',
        'ENT Examination',
        'Dental Examination'
      ],
      'SHALYA': [
        'Surgical Consultation',
        'Pre-operative Assessment',
        'Post-operative Care'
      ],
      'PANCHKARMA': [
        'Abhyanga',
        'Shirodhara',
        'Panchakarma Therapy',
        'Detox Treatment'
      ],
      'IPD': [
        'Room Charges',
        'Nursing Care',
        'Doctor Consultation'
      ],
      'PRASUTI': [
        'Antenatal Care',
        'Delivery Charges',
        'Postnatal Care'
      ],
      'PRIVATE WARD': [
        'AC Room',
        'Deluxe Room',
        'Suite Room'
      ],
      'AMBULANCE': [
        'Basic Ambulance',
        'Advanced Life Support',
        'Emergency Transport'
      ]
    };

    const testTypes = categoryTestTypes[category] || [];
    return new Observable(observer => {
      observer.next(testTypes);
      observer.complete();
    });
  }

  // Get available tests by category and test type
  getTestsByCategoryAndType(category: string, testType: string): Observable<TestInfo[]> {
    const testData: { [key: string]: { [key: string]: TestInfo[] } } = {
      'PATHOLOGY': {
        'Blood Test': [
        {
          testName: 'Complete Blood Count (CBC)',
          testType: 'Blood Test',
          price: 300,
          description: 'Complete blood count with differential',
          parameters: [
            { parameterName: 'Hemoglobin', normalRange: '12-16 g/dL', unit: 'g/dL', isRequired: true },
            { parameterName: 'WBC Count', normalRange: '4000-11000 /μL', unit: '/μL', isRequired: true },
            { parameterName: 'RBC Count', normalRange: '4.5-5.5 million/μL', unit: 'million/μL', isRequired: true },
            { parameterName: 'Platelet Count', normalRange: '150000-450000 /μL', unit: '/μL', isRequired: true }
          ]
        },
        {
          testName: 'Blood Sugar (Fasting)',
          testType: 'Blood Test',
          price: 150,
          description: 'Fasting blood glucose test',
          parameters: [
            { parameterName: 'Glucose', normalRange: '70-100 mg/dL', unit: 'mg/dL', isRequired: true }
          ]
        },
        {
          testName: 'Blood Sugar (Random)',
          testType: 'Blood Test',
          price: 120,
          description: 'Random blood glucose test',
          parameters: [
            { parameterName: 'Glucose', normalRange: '<200 mg/dL', unit: 'mg/dL', isRequired: true }
          ]
        },
        {
          testName: 'Lipid Profile',
          testType: 'Blood Test',
          price: 500,
          description: 'Complete lipid panel',
          parameters: [
            { parameterName: 'Total Cholesterol', normalRange: '<200 mg/dL', unit: 'mg/dL', isRequired: true },
            { parameterName: 'HDL Cholesterol', normalRange: '>40 mg/dL', unit: 'mg/dL', isRequired: true },
            { parameterName: 'LDL Cholesterol', normalRange: '<100 mg/dL', unit: 'mg/dL', isRequired: true },
            { parameterName: 'Triglycerides', normalRange: '<150 mg/dL', unit: 'mg/dL', isRequired: true }
          ]
        },
        {
          testName: 'Liver Function Test (LFT)',
          testType: 'Blood Test',
          price: 600,
          description: 'Liver function panel',
          parameters: [
            { parameterName: 'SGPT/ALT', normalRange: '7-56 U/L', unit: 'U/L', isRequired: true },
            { parameterName: 'SGOT/AST', normalRange: '10-40 U/L', unit: 'U/L', isRequired: true },
            { parameterName: 'Bilirubin Total', normalRange: '0.3-1.2 mg/dL', unit: 'mg/dL', isRequired: true }
          ]
        },
        {
          testName: 'Kidney Function Test (KFT)',
          testType: 'Blood Test',
          price: 550,
          description: 'Kidney function panel',
          parameters: [
            { parameterName: 'Urea', normalRange: '15-40 mg/dL', unit: 'mg/dL', isRequired: true },
            { parameterName: 'Creatinine', normalRange: '0.6-1.2 mg/dL', unit: 'mg/dL', isRequired: true },
            { parameterName: 'Uric Acid', normalRange: '3.5-7.2 mg/dL', unit: 'mg/dL', isRequired: true }
          ]
        }
      ],
      'Urine Test': [
        {
          testName: 'Urine Routine & Microscopy',
          testType: 'Urine Test',
          price: 200,
          description: 'Complete urine analysis',
          parameters: [
            { parameterName: 'Protein', normalRange: 'Negative', unit: '', isRequired: true },
            { parameterName: 'Sugar', normalRange: 'Negative', unit: '', isRequired: true },
            { parameterName: 'Pus Cells', normalRange: '0-5 /hpf', unit: '/hpf', isRequired: true },
            { parameterName: 'RBC', normalRange: '0-2 /hpf', unit: '/hpf', isRequired: true }
          ]
        },
        {
          testName: 'Urine Culture & Sensitivity',
          testType: 'Urine Test',
          price: 400,
          description: 'Urine culture for bacterial infection',
          parameters: [
            { parameterName: 'Bacterial Growth', normalRange: 'No Growth', unit: '', isRequired: true },
            { parameterName: 'Colony Count', normalRange: '<10^5 CFU/mL', unit: 'CFU/mL', isRequired: false }
          ]
        }
      ],
      'Stool Test': [
        {
          testName: 'Stool Routine & Microscopy',
          testType: 'Stool Test',
          price: 180,
          description: 'Complete stool analysis',
          parameters: [
            { parameterName: 'Consistency', normalRange: 'Formed', unit: '', isRequired: true },
            { parameterName: 'Occult Blood', normalRange: 'Negative', unit: '', isRequired: true },
            { parameterName: 'Parasites', normalRange: 'Not Seen', unit: '', isRequired: true }
          ]
        }
      ],
      'Sputum Test': [
        {
          testName: 'Sputum for AFB',
          testType: 'Sputum Test',
          price: 250,
          description: 'Sputum test for tuberculosis',
          parameters: [
            { parameterName: 'AFB', normalRange: 'Not Seen', unit: '', isRequired: true }
          ]
        }
      ],
      'Biopsy': [
        {
          testName: 'Tissue Biopsy',
          testType: 'Biopsy',
          price: 1500,
          description: 'Histopathological examination',
          parameters: [
            { parameterName: 'Histology', normalRange: 'Normal Architecture', unit: '', isRequired: true }
          ]
        }
      ],
      'Culture': [
        {
          testName: 'Blood Culture',
          testType: 'Culture',
          price: 600,
          description: 'Blood culture for bacterial infection',
          parameters: [
            { parameterName: 'Bacterial Growth', normalRange: 'No Growth', unit: '', isRequired: true }
          ]
        }
      ]
      },
      'X-RAY': {
        'Chest X-Ray': [
          {
            testName: 'Chest X-Ray PA View',
            testType: 'Chest X-Ray',
            price: 400,
            description: 'Posterior-anterior chest X-ray',
            parameters: [
              { parameterName: 'Heart Size', normalRange: 'Normal', unit: '', isRequired: true },
              { parameterName: 'Lung Fields', normalRange: 'Clear', unit: '', isRequired: true }
            ]
          },
          {
            testName: 'Chest X-Ray Lateral View',
            testType: 'Chest X-Ray',
            price: 500,
            description: 'Lateral chest X-ray',
            parameters: [
              { parameterName: 'Cardiac Silhouette', normalRange: 'Normal', unit: '', isRequired: true }
            ]
          }
        ],
        'Bone X-Ray': [
          {
            testName: 'Hand X-Ray',
            testType: 'Bone X-Ray',
            price: 350,
            description: 'X-ray of hand bones',
            parameters: [
              { parameterName: 'Bone Alignment', normalRange: 'Normal', unit: '', isRequired: true },
              { parameterName: 'Fracture', normalRange: 'None', unit: '', isRequired: true }
            ]
          },
          {
            testName: 'Spine X-Ray',
            testType: 'Bone X-Ray',
            price: 600,
            description: 'Spinal X-ray examination',
            parameters: [
              { parameterName: 'Vertebral Alignment', normalRange: 'Normal', unit: '', isRequired: true }
            ]
          }
        ],
        'Abdominal X-Ray': [
          {
            testName: 'KUB X-Ray',
            testType: 'Abdominal X-Ray',
            price: 450,
            description: 'Kidney, ureter, bladder X-ray',
            parameters: [
              { parameterName: 'Kidney Outline', normalRange: 'Normal', unit: '', isRequired: true },
              { parameterName: 'Bladder', normalRange: 'Normal', unit: '', isRequired: true }
            ]
          }
        ]
      },
      'ECG': {
        'Resting ECG': [
          {
            testName: '12-Lead ECG',
            testType: 'Resting ECG',
            price: 200,
            description: 'Standard 12-lead electrocardiogram',
            parameters: [
              { parameterName: 'Heart Rate', normalRange: '60-100 bpm', unit: 'bpm', isRequired: true },
              { parameterName: 'Rhythm', normalRange: 'Sinus Rhythm', unit: '', isRequired: true },
              { parameterName: 'PR Interval', normalRange: '120-200 ms', unit: 'ms', isRequired: true }
            ]
          }
        ],
        'Stress ECG': [
          {
            testName: 'Treadmill Test',
            testType: 'Stress ECG',
            price: 800,
            description: 'Exercise stress test with ECG monitoring',
            parameters: [
              { parameterName: 'Exercise Tolerance', normalRange: 'Good', unit: '', isRequired: true },
              { parameterName: 'ST Changes', normalRange: 'None', unit: '', isRequired: true }
            ]
          }
        ]
      },
      'SHALAKYA': {
        'Eye Examination': [
          {
            testName: 'Complete Eye Checkup',
            testType: 'Eye Examination',
            price: 500,
            description: 'Comprehensive eye examination',
            parameters: [
              { parameterName: 'Visual Acuity', normalRange: '6/6', unit: '', isRequired: true },
              { parameterName: 'Intraocular Pressure', normalRange: '10-21 mmHg', unit: 'mmHg', isRequired: true }
            ]
          }
        ],
        'ENT Examination': [
          {
            testName: 'ENT Consultation',
            testType: 'ENT Examination',
            price: 400,
            description: 'Ear, nose, throat examination',
            parameters: [
              { parameterName: 'Hearing', normalRange: 'Normal', unit: '', isRequired: true },
              { parameterName: 'Throat', normalRange: 'Normal', unit: '', isRequired: true }
            ]
          }
        ]
      },
      'SHALYA': {
        'Surgical Consultation': [
          {
            testName: 'General Surgery Consultation',
            testType: 'Surgical Consultation',
            price: 600,
            description: 'General surgical consultation',
            parameters: [
              { parameterName: 'Assessment', normalRange: 'Normal', unit: '', isRequired: true }
            ]
          }
        ]
      },
      'PANCHKARMA': {
        'Abhyanga': [
          {
            testName: 'Full Body Abhyanga',
            testType: 'Abhyanga',
            price: 1200,
            description: 'Traditional oil massage therapy',
            parameters: [
              { parameterName: 'Duration', normalRange: '60 minutes', unit: 'minutes', isRequired: true }
            ]
          }
        ],
        'Shirodhara': [
          {
            testName: 'Shirodhara Therapy',
            testType: 'Shirodhara',
            price: 1500,
            description: 'Oil pouring therapy for head',
            parameters: [
              { parameterName: 'Duration', normalRange: '45 minutes', unit: 'minutes', isRequired: true }
            ]
          }
        ]
      },
      'IPD': {
        'Room Charges': [
          {
            testName: 'General Ward',
            testType: 'Room Charges',
            price: 800,
            description: 'General ward per day charges',
            parameters: [
              { parameterName: 'Days', normalRange: '1', unit: 'days', isRequired: true }
            ]
          },
          {
            testName: 'Private Room',
            testType: 'Room Charges',
            price: 1500,
            description: 'Private room per day charges',
            parameters: [
              { parameterName: 'Days', normalRange: '1', unit: 'days', isRequired: true }
            ]
          }
        ]
      },
      'PRASUTI': {
        'Antenatal Care': [
          {
            testName: 'Antenatal Checkup',
            testType: 'Antenatal Care',
            price: 500,
            description: 'Routine antenatal examination',
            parameters: [
              { parameterName: 'Blood Pressure', normalRange: '120/80 mmHg', unit: 'mmHg', isRequired: true },
              { parameterName: 'Weight', normalRange: 'Normal gain', unit: 'kg', isRequired: true }
            ]
          }
        ]
      },
      'PRIVATE WARD': {
        'AC Room': [
          {
            testName: 'AC Private Room',
            testType: 'AC Room',
            price: 2000,
            description: 'Air-conditioned private room per day',
            parameters: [
              { parameterName: 'Days', normalRange: '1', unit: 'days', isRequired: true }
            ]
          }
        ]
      },
      'AMBULANCE': {
        'Basic Ambulance': [
          {
            testName: 'Basic Ambulance Service',
            testType: 'Basic Ambulance',
            price: 1000,
            description: 'Basic ambulance transportation',
            parameters: [
              { parameterName: 'Distance', normalRange: '10 km', unit: 'km', isRequired: true }
            ]
          }
        ]
      }
    };

    const categoryData = testData[category] || {};
    const tests = categoryData[testType] || [];
    return new Observable(observer => {
      observer.next(tests);
      observer.complete();
    });
  }
}
