# TutorLog

Personal log of tutoring lessons: what was taught, what still needs invoicing, and how much prepaid credit each student has left.

## Language

### People

**Student**:
A person being tutored; the unit everything else (lessons, credit) belongs to. Each student is billed on their own — there is no separate payer or shared family credit.
_Avoid_: Client, customer

**Lesson link** (_odkaz na výuku_):
The URL where a student's online lessons take place (Meet, Zoom, Teams…). Optional. All teaching is currently online.
_Avoid_: Meet link (too platform-specific)

**Archived student**:
A student who no longer takes lessons but whose history is kept. Never the default selection.
_Avoid_: Inactive, deleted

### Lessons

**Lesson** (_hodina_):
One tutoring session on a given date, measured in hours.
_Avoid_: Class, session

**Paid no-show** (_absence_):
A lesson that did not happen but is still charged.

**Payment method**:
How a lesson is paid: by **Invoice** (charged afterwards) or by **Credit** (deducted from prepaid hours).

**Billable** (_účtovat_):
An invoice-paid lesson that should be charged. A non-billable lesson is free.
_Avoid_: using "billable" for credit-paid lessons — they are paid, not free

**Invoiced** (_vyfakturováno_):
A billable lesson that has already been put on an invoice. Applies only to invoice-paid lessons.

### Credit

**Credit** (_kredit_):
Prepaid lesson hours a student holds. Measured in hours, not money; the balance can go negative.
_Avoid_: Balance in Kč, prepayment

**Top-up** (_dobití_):
Adding credit hours because the student paid in advance.

**Lesson deduction** (_odečtení_):
Credit removed because a credit-paid lesson was taught. Belongs to that lesson: deleting the lesson returns the credit.

**Adjustment** (_úprava_):
A manual correction of credit (positive or negative) that is not a payment, e.g. a reset to zero.

### Money

**Hourly rate** (_sazba_):
The price of one hour for a given student. Each lesson keeps the rate that applied when it was logged.

**Package** (_balíček_):
A top-up sold as a bundle of hours for a fixed price, often below hours × rate. The price paid is what counts, not the hours.

**Odměna** (_monthly income_):
Money received in a month: billable invoice-paid lessons plus credit top-ups. Credit lessons taught and adjustments don't count — the money arrived at top-up time.
_Avoid_: Earnings (implies money earned by teaching, which is a different number)
