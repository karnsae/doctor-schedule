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

  // Starting Simulated Date (From Metadata: 2026-07-29)
  const INITIAL_REAL_DATE = "2026-07-29"; 
  let currentSimulatedDate = parseLocalDate(INITIAL_REAL_DATE);

  // Active Calendar Month (Initial view is July 2026 - month index 6)
  let activeMonth = 6; 
  let activeYear = 2026;
  
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

  // Generate a list of all duty days for a doctor in the range of the schedule (July 1 - Sept 26, 2026)
  function getDoctorAllDuties(doctorName) {
    const duties = [];
    const startDate = parseLocalDate("2026-07-01");
    const endDate = parseLocalDate("2026-09-26");
    
    // Loop through each day
    let loopDate = new Date(startDate);
    while (loopDate <= endDate) {
      const slots = getDutyOnDate(loopDate, doctorName);
      if (slots.length > 0) {
        slots.forEach(slot => {
          duties.push({
            date: new Date(loopDate),
            time: slot.time,
            blockName: getBlockForDate(loopDate).name
          });
        });
      }
      loopDate.setDate(loopDate.getDate() + 1);
    }
    
    // Sort duties chronologically
    return duties.sort((a, b) => a.date - b.date);
  }

  // Initialize unique doctors list
  function initDoctorsList() {
    const doctorsSet = new Set();
    window.SCHEDULE_BLOCKS.forEach(block => {
      Object.keys(block.schedule).forEach(day => {
        block.schedule[day].forEach(slot => {
          slot.doctors.forEach(doc => {
            if (doc.trim()) doctorsSet.add(doc.trim());
          });
        });
      });
    });
    
    // Sort alphabetically (Thai order)
    allDoctorsList = Array.from(doctorsSet).sort((a, b) => a.localeCompare(b, 'th'));
    
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
      }
      
      // Check duty
      const duties = getDutyOnDate(thisDate, selectedDoctor);
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

    // Limit Nav Buttons based on data scope (July, Aug, Sept 2026)
    // July 2026 = Index 6. Sept 2026 = Index 8.
    btnPrevMonth.style.opacity = (activeMonth <= 6 && activeYear === 2026) ? "0.3" : "1";
    btnPrevMonth.style.pointerEvents = (activeMonth <= 6 && activeYear === 2026) ? "none" : "all";
    
    btnNextMonth.style.opacity = (activeMonth >= 8 && activeYear === 2026) ? "0.3" : "1";
    btnNextMonth.style.pointerEvents = (activeMonth >= 8 && activeYear === 2026) ? "none" : "all";
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
  }

  // --- Modal Day details panel ---
  function openDayDetail(date) {
    const formattedTitle = `${THAI_DAYS[date.getDay()]}ที่ ${date.getDate()} ${THAI_MONTHS[date.getMonth()]} พ.ศ. ${date.getFullYear() + 543}`;
    modalDateTitle.textContent = `ตารางเวร: ${formattedTitle}`;
    
    const dateStr = formatLocalDate(date);
    
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

  // Calendar navigation Month Previous/Next
  btnPrevMonth.addEventListener("click", () => {
    if (activeMonth > 6) { // Block begins in July (6)
      activeMonth--;
      renderCalendar();
      updateDoctorInfo();
    }
  });

  btnNextMonth.addEventListener("click", () => {
    if (activeMonth < 8) { // Block ends in September (8)
      activeMonth++;
      renderCalendar();
      updateDoctorInfo();
    }
  });

  // Simulator date change
  simDatePicker.addEventListener("change", (e) => {
    if (e.target.value) {
      currentSimulatedDate = parseLocalDate(e.target.value);
      renderCalendar();
      updateDoctorInfo();
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
  });

  // --- Initializing App ---
  
  // Set simulator date picker field value
  simDatePicker.value = INITIAL_REAL_DATE;
  
  // Parse schedules & populate doctors
  initDoctorsList();
  
  // Draw layout
  renderCalendar();
  updateDoctorInfo();
});
