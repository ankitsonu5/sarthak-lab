# Backfill Pathology Invoice References

Simple one-time script endpoint suggestion (implemented in routes below) to fill patientRef/doctorRef/departmentRef/appointmentRef for legacy invoices.

Use: GET /api/pathology-invoice/admin/backfill-refs

- Only does safe lookups
- Skips when ref already present
- Derives:
  - patientRef from patientId (UHID) or embedded patient.registrationNumber
  - doctorRef from doctorId
  - departmentRef from departmentId
  - appointmentRef from appointmentId (APT000xxx)

