// Doctor Scheduling System - Main Application Logic
// Requires data.js (window.SCHEDULE_BLOCKS)

document.addEventListener("DOMContentLoaded", () => {
  // --- Constants and App State ---
  const THAI_MONTHS = [
    "มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน",
    "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม"
  ];
  
  const THAI_DAYS = [
    "อาทิตย์", "จันทร์", "อังคาร", "พุธ", "พฤหัสบดี", "ศุกร์", "เสาร์"
  ];

  const THAI_DAYS_SHORT = [
    "อา.", "จ.", "อ.", "พ.", "พฤ.", "ศ.", "ส."
  ];

  // Get today's real date in YYYY-MM-DD format
  const getTodayDateString = () => {
    const d = new Date();
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  const INITIAL_REAL_DATE = getTodayDateString();
  let currentSimulatedDate = parseLocalDate(INITIAL_REAL_DATE);

  // Active Calendar Month (Initial view is today's month/year, clamped to July 2026 - June 2027 if outside range)
  const todayDate = new Date();
  let activeMonth = todayDate.getMonth();
  let activeYear = todayDate.getFullYear();

  // Clamp initial calendar month/year to July 2026 - June 2027 range if outside
  const totalMonths = activeYear * 12 + activeMonth;
  const minMonths = 2026 * 12 + 6; // July 2026
  const maxMonths = 2027 * 12 + 5; // June 2027
  
  if (totalMonths < minMonths) {
    activeMonth = 6;
    activeYear = 2026;
  } else if (totalMonths > maxMonths) {
    activeMonth = 5;
    activeYear = 2027;
  }
  
  // Selected Doctor
  let selectedDoctor = "";
  
  // Cache of unique doctors list
  let allDoctorsList = [];

  // --- DOM Elements ---
  const doctorSelect = document.getElementById("doctor-select");
  const calendarTitle = document.getElementById("calendar-title");
  const calendarDaysContainer = document.getElementById("calendar-days");
  const upcomingShiftsContainer = document.getElementById("upcoming-shifts-container");
  
  // Stats
  const statNextDate = document.getElementById("stat-next-date");
  const statNextTime = document.getElementById("stat-next-time");
  const statCountdown = document.getElementById("stat-countdown");
  const statCountdownUnit = document.getElementById("stat-countdown-unit");
  const statTotalShifts = document.getElementById("stat-total-shifts");
  
  // Simulator Widgets
  const simDatePicker = document.getElementById("sim-date-picker");
  const btnResetDate = document.getElementById("btn-reset-date");
  
  // Month Nav
  const btnPrevMonth = document.getElementById("btn-prev-month");
  const btnNextMonth = document.getElementById("btn-next-month");

  // Modal Elements
  const detailModal = document.getElementById("detail-modal");
  const modalDateTitle = document.getElementById("modal-date-title");
  const modalBlockName = document.getElementById("modal-block-name");
  const modalSlots = document.getElementById("modal-slots");

  // --- Helper Functions ---
  
  // Safely parse date in local timezone to avoid zone shift
  function parseLocalDate(dateStr) {
    const [year, month, day] = dateStr.split('-').map(Number);
    return new Date(year, month - 1, day);
  }

  // Safely format date as YYYY-MM-DD
  function formatLocalDate(date) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  // Strip time from date to get pure date comparisons
  function getMidnightDate(date) {
    return new Date(date.getFullYear(), date.getMonth(), date.getDate());
  }

  // Find which block a date belongs to (returns block object or null)
  function getBlockForDate(date) {
    const dateStr = formatLocalDate(date);
    return window.SCHEDULE_BLOCKS.find(block => {
      return dateStr >= block.startDate && dateStr <= block.endDate;
    }) || null;
  }

  // Get active schedule for a specific date and day of the week
  function getDutyOnDate(date, doctorName) {
    const dateStr = formatLocalDate(date);
    // If it's a Thai public holiday, no one works!
    if (window.HOLIDAYS_2026 && window.HOLIDAYS_2026[dateStr]) {
      return [];
    }

    const block = getBlockForDate(date);
    if (!block) return [];

    const dayOfWeek = date.getDay(); // 0 = Sun, 1 = Mon, ..., 6 = Sat
    // Schedules are mapped for weekdays (1 to 5)
    if (dayOfWeek < 1 || dayOfWeek > 5) return [];

    const daySchedule = block.schedule[dayOfWeek];
    if (!daySchedule) return [];

    // Filter slots where the doctor is on duty
    return daySchedule.filter(slot => slot.doctors.includes(doctorName));
  }

  // Generate a list of all duty days for a doctor in the range of the schedule (dynamically scans all blocks)
  function getDoctorAllDuties(doctorName) {
    const duties = [];
    if (!window.SCHEDULE_BLOCKS || window.SCHEDULE_BLOCKS.length === 0) return [];
    
    // Dynamically find start and end dates from all blocks
    const startDates = window.SCHEDULE_BLOCKS.map(b => b.startDate);
    const endDates = window.SCHEDULE_BLOCKS.map(b => b.endDate);
    const minStart = startDates.reduce((min, d) => d < min ? d : min, startDates[0]);
    const maxEnd = endDates.reduce((max, d) => d > max ? d : max, endDates[0]);
    
    const startDate = parseLocalDate(minStart);
    const endDate = parseLocalDate(maxEnd);
    
    // Loop through each day
    let loopDate = new Date(startDate);
    while (loopDate <= endDate) {
      const slots = getDutyOnDate(loopDate, doctorName);
      if (slots.length > 0) {
        slots.forEach(slot => {
          const block = getBlockForDate(loopDate);
          duties.push({
            date: new Date(loopDate),
            time: slot.time,
            blockName: block ? block.name : ""
          });
        });
      }
      loopDate.setDate(loopDate.getDate() + 1);
    }
    
    // Sort duties chronologically
    return duties.sort((a, b) => a.date - b.date);
  }

  // Sort key helper: strips นพ. and พญ.
  function getSortKey(name) {
    return name.replace(/^(นพ\.|พญ\.)\s*/, "");
  }

  // Check if a doctor is on vacation on a specific date
  function getDoctorVacation(docName, date) {
    if (!window.RESIDENT_VACATIONS || !window.RESIDENT_VACATIONS[docName]) {
      return null;
    }
    const vac = window.RESIDENT_VACATIONS[docName];
    if (!vac.start || !vac.end) return null;
    
    const d = getMidnightDate(date);
    const start = getMidnightDate(parseLocalDate(vac.start));
    const end = getMidnightDate(parseLocalDate(vac.end));
    
    if (d.getTime() >= start.getTime() && d.getTime() <= end.getTime()) {
      return vac;
    }
    return null;
  }

  // Format vacation range for Thai UI
  function formatThaiVacationRange(vac) {
    if (!vac || !vac.start || !vac.end) return "ไม่มีวันลาพักร้อน";
    
    const startDate = new Date(vac.start);
    const endDate = new Date(vac.end);
    
    const startDay = startDate.getDate();
    const startMonth = THAI_MONTHS[startDate.getMonth()];
    const startYear = startDate.getFullYear() + 543;
    
    const endDay = endDate.getDate();
    const endMonth = THAI_MONTHS[endDate.getMonth()];
    const endYear = endDate.getFullYear() + 543;
    
    // Same year
    if (startYear === endYear) {
      // Same month
      if (startMonth === endMonth) {
        return `${startDay} - ${endDay} ${startMonth} ${startYear.toString().slice(-2)}`;
      }
      return `${startDay} ${startMonth} - ${endDay} ${endMonth} ${startYear.toString().slice(-2)}`;
    }
    return `${startDay} ${startMonth} ${startYear.toString().slice(-2)} - ${endDay} ${endMonth} ${endYear.toString().slice(-2)}`;
  }

  // Initialize unique doctors list
  function initDoctorsList() {
    const doctorsSet = new Set();
    
    // Add all doctors from contact directory first
    if (window.RESIDENT_CONTACTS) {
      Object.keys(window.RESIDENT_CONTACTS).forEach(name => {
        if (name.trim()) doctorsSet.add(name.trim());
      });
    }

    // Add any remaining doctors from schedule blocks as fallback
    window.SCHEDULE_BLOCKS.forEach(block => {
      Object.keys(block.schedule).forEach(day => {
        block.schedule[day].forEach(slot => {
          slot.doctors.forEach(doc => {
            if (doc.trim()) doctorsSet.add(doc.trim());
          });
        });
      });
    });
    
    // Sort alphabetically (Thai order) ignoring นพ. and พญ. prefixes
    allDoctorsList = Array.from(doctorsSet).sort((a, b) => {
      const keyA = getSortKey(a);
      const keyB = getSortKey(b);
      return keyA.localeCompare(keyB, 'th');
    });
    
    // Populate select element
    doctorSelect.innerHTML = "";
    allDoctorsList.forEach(docName => {
      const option = document.createElement("option");
      option.value = docName;
      option.textContent = docName;
      doctorSelect.appendChild(option);
    });

    // Default to the first doctor
    if (allDoctorsList.length > 0) {
      selectedDoctor = allDoctorsList[0];
      doctorSelect.value = selectedDoctor;
    }
  }

  // --- Rendering UI Panels ---

  // Render Calendar Grid
  function renderCalendar() {
    // 1. Title (Format Thai year: BE = AD + 543)
    calendarTitle.textContent = `${THAI_MONTHS[activeMonth]} ${activeYear + 543}`;
    
    // 2. Clear previous cells
    calendarDaysContainer.innerHTML = "";
    
    // 3. Month specs
    const firstDayIndex = new Date(activeYear, activeMonth, 1).getDay(); // 0 = Sun, 1 = Mon ...
    const totalDays = new Date(activeYear, activeMonth + 1, 0).getDate();
    
    // Get last month specs for padding
    const prevMonthTotalDays = new Date(activeYear, activeMonth, 0).getDate();
    
    // Draw padding cells for previous month
    for (let i = firstDayIndex; i > 0; i--) {
      const dayCell = document.createElement("div");
      dayCell.className = "day-cell other-month";
      const dayNum = prevMonthTotalDays - i + 1;
      dayCell.innerHTML = `<span class="day-number">${dayNum}</span>`;
      calendarDaysContainer.appendChild(dayCell);
    }
    
    // Draw current month cells
    for (let day = 1; day <= totalDays; day++) {
      const dayCell = document.createElement("div");
      dayCell.className = "day-cell";
      
      const thisDate = new Date(activeYear, activeMonth, day);
      const dateStr = formatLocalDate(thisDate);
      const dayOfWeek = thisDate.getDay();
      
      // Class: holiday
      let isHoliday = false;
      let holidayName = "";
      if (window.HOLIDAYS_2026 && window.HOLIDAYS_2026[dateStr]) {
        isHoliday = true;
        holidayName = window.HOLIDAYS_2026[dateStr];
        dayCell.classList.add("is-holiday");
        dayCell.title = holidayName;
      }
      
      // Check if doctor is on vacation this day
      let isVacation = false;
      if (getDoctorVacation(selectedDoctor, thisDate)) {
        isVacation = true;
        dayCell.classList.add("is-vacation");
      }
      
      // Class: weekend
      if (dayOfWeek === 0 || dayOfWeek === 6) {
        dayCell.classList.add("weekend");
      }
      
      // Class: today (simulated)
      if (dateStr === formatLocalDate(currentSimulatedDate)) {
        dayCell.classList.add("is-today");
      }
      
      // Day Number Label
      dayCell.innerHTML = `<span class="day-number">${day}</span>`;
      if (isHoliday) {
        dayCell.innerHTML += `<span class="holiday-label" title="${holidayName}">วันหยุด</span>`;
      } else if (isVacation) {
        dayCell.innerHTML += `<span class="vacation-label">ลาพักร้อน</span>`;
      }
      
      // Check duty (only if not on vacation)
      const duties = isVacation ? [] : getDutyOnDate(thisDate, selectedDoctor);
      if (duties.length > 0) {
        dayCell.classList.add("on-duty");
        
        const badgeContainer = document.createElement("div");
        badgeContainer.className = "shift-indicator-container";
        
        duties.forEach(duty => {
          const badge = document.createElement("span");
          // Categorize badges based on start hour for colors
          const startHour = parseInt(duty.time.split(".")[0]);
          let timeClass = "morn";
          if (startHour >= 12) {
            timeClass = "noon";
          } else if (startHour >= 10) {
            timeClass = "noon";
          }
          
          badge.className = `shift-badge ${timeClass}`;
          badge.textContent = duty.time;
          badgeContainer.appendChild(badge);
        });
        
        dayCell.appendChild(badgeContainer);
      }
      
      // Click Event to open Day Details
      dayCell.addEventListener("click", () => {
        openDayDetail(thisDate);
      });
      
      calendarDaysContainer.appendChild(dayCell);
    }
    
    // Draw padding cells for next month to complete the grid (6 rows * 7 columns = 42 cells)
    const currentCellsCount = firstDayIndex + totalDays;
    const remainingCells = 42 - currentCellsCount;
    for (let i = 1; i <= remainingCells; i++) {
      const dayCell = document.createElement("div");
      dayCell.className = "day-cell other-month";
      dayCell.innerHTML = `<span class="day-number">${i}</span>`;
      calendarDaysContainer.appendChild(dayCell);
    }

    // Limit Nav Buttons based on academic year scope (July 2026 to June 2027)
    const isMinMonth = (activeMonth === 6 && activeYear === 2026);
    btnPrevMonth.style.opacity = isMinMonth ? "0.3" : "1";
    btnPrevMonth.style.pointerEvents = isMinMonth ? "none" : "all";
    
    const isMaxMonth = (activeMonth === 5 && activeYear === 2027);
    btnNextMonth.style.opacity = isMaxMonth ? "0.3" : "1";
    btnNextMonth.style.pointerEvents = isMaxMonth ? "none" : "all";
  }

  // Render Sidebar Panels: Stats and Upcoming Shifts
  function updateDoctorInfo() {
    const allDuties = getDoctorAllDuties(selectedDoctor);
    const simulatedMidnight = getMidnightDate(currentSimulatedDate);
    
    // 1. Total shifts in active month
    const shiftsThisMonth = allDuties.filter(duty => {
      return duty.date.getMonth() === activeMonth && duty.date.getFullYear() === activeYear;
    }).length;
    statTotalShifts.textContent = shiftsThisMonth;
    
    // 2. Upcoming shifts list
    upcomingShiftsContainer.innerHTML = "";
    
    // Separate into upcoming and past
    const upcomingDuties = [];
    allDuties.forEach(duty => {
      const dutyMidnight = getMidnightDate(duty.date);
      const diffTime = dutyMidnight.getTime() - simulatedMidnight.getTime();
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
      
      upcomingDuties.push({
        ...duty,
        diffDays
      });
    });
    
    // Filter only current/future duties (diffDays >= 0)
    const futureDuties = upcomingDuties.filter(d => d.diffDays >= 0);
    
    if (futureDuties.length === 0) {
      upcomingShiftsContainer.innerHTML = `
        <div class="no-shifts-placeholder">
          <span>🩺 ไม่มีเวรตรวจที่กำลังจะถึง</span>
          <span style="font-size:0.75rem;">ในช่วงตารางนี้ (ถึง 26 ก.ย. 69)</span>
        </div>
      `;
      statNextDate.textContent = "-";
      statNextTime.textContent = "-";
      statCountdown.textContent = "-";
      statCountdownUnit.textContent = "ไม่มีการตรวจถัดไป";
    } else {
      // Set Stats for Next Shift
      const nextShift = futureDuties[0];
      const nextDateFormatted = `${THAI_DAYS_SHORT[nextShift.date.getDay()]} ${nextShift.date.getDate()} ${THAI_MONTHS[nextShift.date.getMonth()].slice(0, 4)} ${nextShift.date.getFullYear() + 543 - 2500}`;
      statNextDate.textContent = nextDateFormatted;
      statNextTime.textContent = `${nextShift.time} น.`;
      
      // Stats Countdown
      if (nextShift.diffDays === 0) {
        statCountdown.textContent = "วันนี้";
        statCountdown.classList.add("highlight");
        statCountdownUnit.textContent = "มีตารางออกตรวจวันนี้";
      } else if (nextShift.diffDays === 1) {
        statCountdown.textContent = "1";
        statCountdownUnit.textContent = "วันจะถึงวันนัด (พรุ่งนี้)";
      } else {
        statCountdown.textContent = nextShift.diffDays;
        statCountdownUnit.textContent = "วันจะถึงวันนัด";
      }
      
      // Render future list items
      futureDuties.forEach(d => {
        const item = document.createElement("div");
        item.className = "shift-card-item";
        
        const dateName = `${THAI_DAYS[d.date.getDay()]}ที่ ${d.date.getDate()} ${THAI_MONTHS[d.date.getMonth()]} ${d.date.getFullYear() + 543}`;
        
        let pillClass = "future";
        let pillText = `อีก ${d.diffDays} วัน`;
        
        if (d.diffDays === 0) {
          pillClass = "today";
          pillText = "วันนี้";
        } else if (d.diffDays === 1) {
          pillClass = "near";
          pillText = "พรุ่งนี้";
        } else if (d.diffDays <= 3) {
          pillClass = "near";
        }
        
        item.innerHTML = `
          <div class="shift-info-meta">
            <span class="shift-date-formatted">${dateName}</span>
            <span class="shift-time-block">⏰ ${d.time} น. <small style="opacity:0.6; margin-left:0.5rem;">(${d.blockName})</small></span>
          </div>
          <span class="shift-countdown-pill ${pillClass}">${pillText}</span>
        `;
        
        // Add click listener to show day detail
        item.addEventListener("click", () => {
          openDayDetail(d.date);
        });
        
        upcomingShiftsContainer.appendChild(item);
      });
    }
    
    // Update doctor contact details and active ward/unit rotations
    updateDoctorProfile();
  }

  // Update Doctor Profile Details (From CSV data)
  function updateDoctorProfile() {
    const profileFullname = document.getElementById("profile-fullname");
    const profileYear = document.getElementById("profile-year");
    const profileNickname = document.getElementById("profile-nickname");
    const profilePhone = document.getElementById("profile-phone");
    const profileRotation = document.getElementById("profile-rotation");
    const profileVacation = document.getElementById("profile-vacation");
    
    // Check if contacts data exists
    if (!window.RESIDENT_CONTACTS) return;
    
    const contact = window.RESIDENT_CONTACTS[selectedDoctor];
    if (contact) {
      profileFullname.textContent = contact.fullName || selectedDoctor;
      
      // Thai residency year translation
      let yearText = contact.year;
      if (contact.year === "R1") yearText = "แพทย์ประจำบ้านชั้นปีที่ 1 (R1)";
      else if (contact.year === "R2") yearText = "แพทย์ประจำบ้านชั้นปีที่ 2 (R2)";
      else if (contact.year === "R3") yearText = "แพทย์ประจำบ้านชั้นปีที่ 3 (R3)";
      profileYear.textContent = yearText;
      
      profileNickname.textContent = contact.nickname ? contact.nickname : "-";
      
      // Phone number formatting
      if (contact.phone && contact.phone.trim()) {
        profilePhone.innerHTML = `<a href="tel:${contact.phone}" class="highlight-phone">📞 ${contact.phone}</a>`;
      } else {
        profilePhone.textContent = "-";
      }
      
      // Vacation leave range formatting
      const vac = window.RESIDENT_VACATIONS ? window.RESIDENT_VACATIONS[selectedDoctor] : null;
      profileVacation.textContent = formatThaiVacationRange(vac);
    } else {
      // Default fallback if doctor not found in contact list
      profileFullname.textContent = selectedDoctor;
      profileYear.textContent = "-";
      profileNickname.textContent = "-";
      profilePhone.textContent = "-";
      profileVacation.textContent = "-";
    }
    
    // Check ward/unit rotation for the current simulated date
    const block = getBlockForDate(currentSimulatedDate);
    if (block && window.RESIDENT_ROTATIONS && window.RESIDENT_ROTATIONS[block.id]) {
      const rotation = window.RESIDENT_ROTATIONS[block.id][selectedDoctor];
      if (rotation) {
        // Translation helper
        let formattedRotation = rotation;
        if (rotation.startsWith("Ward: ")) {
          formattedRotation = "วอร์ด " + rotation.slice(6);
        } else if (rotation.startsWith("Unit: ")) {
          formattedRotation = "หน่วย " + rotation.slice(6);
        }
        profileRotation.textContent = formattedRotation;
        profileRotation.className = "profile-value highlight-rotation";
      } else {
        profileRotation.textContent = "ไม่มีเวรขึ้นวอร์ดช่วงนี้";
        profileRotation.className = "profile-value";
      }
    } else {
      profileRotation.textContent = "-";
      profileRotation.className = "profile-value";
    }
  }

  // --- Modal Day details panel ---
  function openDayDetail(date) {
    const formattedTitle = `${THAI_DAYS[date.getDay()]}ที่ ${date.getDate()} ${THAI_MONTHS[date.getMonth()]} พ.ศ. ${date.getFullYear() + 543}`;
    modalDateTitle.textContent = `ตารางเวร: ${formattedTitle}`;
    
    const dateStr = formatLocalDate(date);
    
    // Check if doctor is on vacation on this day
    const vacation = getDoctorVacation(selectedDoctor, date);
    if (vacation) {
      modalBlockName.textContent = "วันลาพักร้อนของแพทย์";
      modalSlots.innerHTML = `
        <div style="text-align:center; padding:2rem; color:#c084fc; font-weight: 500;">
          🏖️ ${selectedDoctor} ลาพักร้อน (ไม่มีตารางออกตรวจปกติช่วงนี้)
        </div>
      `;
      detailModal.classList.add("open");
      return;
    }

    // Check if it's a Thai public holiday first
    if (window.HOLIDAYS_2026 && window.HOLIDAYS_2026[dateStr]) {
      modalBlockName.textContent = `วันหยุดราชการ: ${window.HOLIDAYS_2026[dateStr]}`;
      modalSlots.innerHTML = `
        <div style="text-align:center; padding:2rem; color:var(--accent-amber); font-weight: 500;">
          🇹🇭 วันหยุดราชการไทย (ไม่มีตารางออกตรวจปกติ / OPD ปิดทำการ)
        </div>
      `;
      detailModal.classList.add("open");
      return;
    }
    
    const block = getBlockForDate(date);
    if (!block) {
      modalBlockName.textContent = "ไม่อยู่ในระยะเวลาตารางเวร (ตารางมีข้อมูลระว่าง 1 ก.ค. - 26 ก.ย. 69)";
      modalSlots.innerHTML = `
        <div style="text-align:center; padding:2rem; color:var(--text-muted);">
          ไม่มีข้อมูลเวรสำหรับวันเสาร์-อาทิตย์ หรือ วันที่อยู่นอกตารางการออกตรวจ
        </div>
      `;
      detailModal.classList.add("open");
      return;
    }
    
    modalBlockName.textContent = `ช่วงเวลาตารางเวร: ${block.name}`;
    modalSlots.innerHTML = "";
    
    const dayOfWeek = date.getDay();
    if (dayOfWeek === 0 || dayOfWeek === 6) {
      modalSlots.innerHTML = `
        <div style="text-align:center; padding:2rem; color:var(--text-muted);">
          🏥 วันเสาร์-อาทิตย์ เป็นวันหยุดพักผ่อน ไม่มีตารางออกตรวจ OPD
        </div>
      `;
      detailModal.classList.add("open");
      return;
    }
    
    const daySchedule = block.schedule[dayOfWeek];
    if (!daySchedule || daySchedule.length === 0) {
      modalSlots.innerHTML = `
        <div style="text-align:center; padding:2rem; color:var(--text-muted);">
          ไม่มีเวรตรวจในระบบสำหรับวันนี้
        </div>
      `;
      detailModal.classList.add("open");
      return;
    }
    
    // Render each slot
    daySchedule.forEach(slot => {
      const slotCard = document.createElement("div");
      slotCard.className = "slot-card";
      
      const containsSelectedDoc = slot.doctors.includes(selectedDoctor);
      if (containsSelectedDoc) {
        slotCard.classList.add("highlight");
      }
      
      const timeHeader = document.createElement("div");
      timeHeader.className = "slot-time-header";
      timeHeader.innerHTML = `<span>⏰ เวลา ${slot.time} น.</span>`;
      if (containsSelectedDoc) {
        timeHeader.innerHTML += ` <span style="background:var(--accent-primary); color:white; font-size:0.6rem; padding:2px 6px; border-radius:4px;">มีชื่อออกตรวจ</span>`;
      }
      
      const docListContainer = document.createElement("div");
      docListContainer.className = "slot-doctors-list";
      
      if (slot.doctors.length === 0) {
        docListContainer.innerHTML = `<span class="no-duty-badge">- ไม่มีแพทย์ออกตรวจช่วงนี้ -</span>`;
      } else {
        slot.doctors.forEach(doc => {
          const badge = document.createElement("span");
          badge.className = "doctor-badge-on-duty";
          if (doc === selectedDoctor) {
            badge.classList.add("highlight-doc");
          }
          badge.textContent = doc;
          docListContainer.appendChild(badge);
        });
      }
      
      slotCard.appendChild(timeHeader);
      slotCard.appendChild(docListContainer);
      modalSlots.appendChild(slotCard);
    });
    
    detailModal.classList.add("open");
  }

  // Close Modal
  window.closeModal = function() {
    detailModal.classList.remove("open");
  };

  // --- Event Listeners and Triggers ---

  // Doctor Selector Change
  doctorSelect.addEventListener("change", (e) => {
    selectedDoctor = e.target.value;
    renderCalendar();
    updateDoctorInfo();
  });

  // Ward Selector Change
  const wardSelect = document.getElementById("ward-select");
  wardSelect.addEventListener("change", () => {
    updateWardDoctors();
  });

  // Calendar navigation Month Previous/Next
  btnPrevMonth.addEventListener("click", () => {
    if (activeYear === 2026 && activeMonth === 6) {
      return;
    }
    activeMonth--;
    if (activeMonth < 0) {
      activeMonth = 11;
      activeYear--;
    }
    renderCalendar();
    updateDoctorInfo();
    updateWardDoctors();
  });

  btnNextMonth.addEventListener("click", () => {
    if (activeYear === 2027 && activeMonth === 5) {
      return;
    }
    activeMonth++;
    if (activeMonth > 11) {
      activeMonth = 0;
      activeYear++;
    }
    renderCalendar();
    updateDoctorInfo();
    updateWardDoctors();
  });

  // Simulator date change
  simDatePicker.addEventListener("change", (e) => {
    if (e.target.value) {
      currentSimulatedDate = parseLocalDate(e.target.value);
      renderCalendar();
      updateDoctorInfo();
      updateWardDoctors();
    }
  });

  // Reset Simulator Date
  btnResetDate.addEventListener("click", () => {
    simDatePicker.value = INITIAL_REAL_DATE;
    currentSimulatedDate = parseLocalDate(INITIAL_REAL_DATE);
    
    // Reset calendar view to July 2026 to see the current mock date
    activeMonth = 6;
    activeYear = 2026;
    
    renderCalendar();
    updateDoctorInfo();
    updateWardDoctors();
  });

  // Collect and initialize all unique Wards and Units across all blocks
  function initWardsList() {
    const uniqueRotations = new Set();
    
    if (window.RESIDENT_ROTATIONS) {
      Object.keys(window.RESIDENT_ROTATIONS).forEach(blockId => {
        Object.keys(window.RESIDENT_ROTATIONS[blockId]).forEach(docName => {
          const rot = window.RESIDENT_ROTATIONS[blockId][docName];
          if (rot) {
            // Exclude elective rotations containing PMK, RA, CMU, CU, TU from the dropdown
            const excludeKeywords = ["PMK", "RA", "CMU", "CU", "TU"];
            const isElective = excludeKeywords.some(keyword => rot.includes(keyword));
            if (!isElective) {
              uniqueRotations.add(rot);
            }
          }
        });
      });
    }
    
    // Sort rotations: Wards first, then Units, alphabetically in Thai
    const sortedRotations = Array.from(uniqueRotations).sort((a, b) => {
      const isWardA = a.startsWith("Ward:");
      const isWardB = b.startsWith("Ward:");
      
      if (isWardA && !isWardB) return -1;
      if (!isWardA && isWardB) return 1;
      
      return a.localeCompare(b, 'th');
    });
    
    // Populate select
    wardSelect.innerHTML = '<option value="">-- เลือกวอร์ด/หน่วยงาน --</option>';
    sortedRotations.forEach(rot => {
      const option = document.createElement("option");
      option.value = rot;
      
      // Formatting display text
      let displayText = rot;
      if (rot.startsWith("Ward: ")) {
        displayText = "วอร์ด " + rot.slice(6);
      } else if (rot.startsWith("Unit: ")) {
        displayText = "หน่วย " + rot.slice(6);
      }
      
      option.textContent = displayText;
      wardSelect.appendChild(option);
    });
  }

  // Update list of doctors rotating in the selected ward/unit during the active block
  function updateWardDoctors() {
    const wardDoctorsContainer = document.getElementById("ward-doctors-container");
    const selectedRot = wardSelect.value;
    
    if (!selectedRot) {
      wardDoctorsContainer.innerHTML = `
        <div class="no-shifts-placeholder" style="padding: 1.5rem 0; text-align: center;">
          <span>🏥 เลือกวอร์ด/หน่วยงานด้านบนเพื่อดูรายชื่อแพทย์</span>
        </div>
      `;
      return;
    }
    
    const block = getBlockForDate(currentSimulatedDate);
    if (!block) {
      wardDoctorsContainer.innerHTML = `
        <div class="no-shifts-placeholder" style="padding: 1.5rem 0; text-align: center;">
          <span>ไม่อยู่ในช่วงระยะเวลาตารางเวร</span>
        </div>
      `;
      return;
    }
    
    // Find all doctors rotating in this ward/unit in this block
    const blockRotations = window.RESIDENT_ROTATIONS[block.id] || {};
    const doctorsInWard = [];
    
    Object.keys(blockRotations).forEach(docName => {
      if (blockRotations[docName] === selectedRot) {
        // Look up details from contact list
        const contact = window.RESIDENT_CONTACTS[docName] || {
          fullName: docName,
          nickname: "-",
          phone: "",
          year: "R1" // fallback
        };
        doctorsInWard.push({
          displayName: docName,
          ...contact
        });
      }
    });
    
    if (doctorsInWard.length === 0) {
      let displayName = selectedRot;
      if (selectedRot.startsWith("Ward: ")) displayName = "วอร์ด " + selectedRot.slice(6);
      else if (selectedRot.startsWith("Unit: ")) displayName = "หน่วย " + selectedRot.slice(6);
      
      wardDoctorsContainer.innerHTML = `
        <div class="no-shifts-placeholder" style="padding: 1.5rem 0; text-align: center;">
          <span>ไม่มีแพทย์เวียนเข้า ${displayName} ในช่วงเวลานี้</span>
          <span style="font-size:0.75rem; margin-top:0.25rem;">(${block.name})</span>
        </div>
      `;
      return;
    }
    
    // Sort doctors by Resident Year descending (R3 -> R2 -> R1) then name
    doctorsInWard.sort((a, b) => {
      const yearOrder = { "R3": 3, "R2": 2, "R1": 1 };
      const orderA = yearOrder[a.year] || 1;
      const orderB = yearOrder[b.year] || 1;
      
      if (orderA !== orderB) {
        return orderB - orderA; // R3 first
      }
      
      const keyA = getSortKey(a.displayName);
      const keyB = getSortKey(b.displayName);
      return keyA.localeCompare(keyB, 'th');
    });
    
    // Render list
    wardDoctorsContainer.innerHTML = "";
    doctorsInWard.forEach(doc => {
      const item = document.createElement("div");
      item.className = "ward-doctor-item";
      
      const badgeClass = doc.year.toLowerCase(); // r1, r2, r3
      const nameWithTitle = doc.fullName.includes("นพ.") || doc.fullName.includes("พญ.") ? doc.fullName : doc.displayName;
      const nickText = doc.nickname ? `ชื่อเล่น: ${doc.nickname}` : "ชื่อเล่น: -";
      
      const phoneText = doc.phone ? `<a href="tel:${doc.phone}" class="ward-phone-link">📞 ${doc.phone}</a>` : "เบอร์โทร: -";
      
      item.innerHTML = `
        <div class="ward-doctor-header">
          <span class="ward-doctor-name">${nameWithTitle}</span>
          <span class="ward-year-badge ${badgeClass}">${doc.year}</span>
        </div>
        <div class="ward-doctor-meta">
          <span>${nickText}</span>
          <span>${phoneText}</span>
        </div>
      `;
      
      // Stop propagation of click on the phone link so clicking phone does not trigger selecting doctor
      const phoneLink = item.querySelector(".ward-phone-link");
      if (phoneLink) {
        phoneLink.addEventListener("click", (e) => {
          e.stopPropagation();
        });
      }
      
      // Click handler: select this doctor
      item.addEventListener("click", () => {
        selectedDoctor = doc.displayName;
        doctorSelect.value = selectedDoctor;
        renderCalendar();
        updateDoctorInfo();
      });
      
      wardDoctorsContainer.appendChild(item);
    });
  }

  // --- Initializing App ---
  
  // Set simulator date picker field value
  simDatePicker.value = INITIAL_REAL_DATE;
  
  // Parse schedules & populate doctors
  initDoctorsList();
  
  // Parse ward/unit list
  initWardsList();
  
  // Draw layout
  renderCalendar();
  updateDoctorInfo();
  updateWardDoctors();
});
