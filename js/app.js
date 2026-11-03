const MEMBER_STORE_KEY = "ICMTAFacultyDirectoryMembers_v4";
const USER_STORE_KEY = "ICMTAFacultyDirectoryUsers_v4";
const MEMBER_DATA_VERSION = "combined-343-members-restored-v5";
try {
  const savedVersion = localStorage.getItem("ICMTAFacultyDirectoryDataVersion");
  const master = window.ICMTA_MASTER_DATA;
  if (master && Array.isArray(master) && master.length > 0 && savedVersion !== MEMBER_DATA_VERSION) {
    localStorage.setItem(MEMBER_STORE_KEY, JSON.stringify(master));
    localStorage.setItem("ICMTAFacultyDirectoryDataVersion", MEMBER_DATA_VERSION);
  }
} catch(e) {
  if (window.ICMTA_MASTER_DATA && Array.isArray(window.ICMTA_MASTER_DATA) && window.ICMTA_MASTER_DATA.length > 0) {
    localStorage.setItem(MEMBER_STORE_KEY, JSON.stringify(window.ICMTA_MASTER_DATA));
    localStorage.setItem("ICMTAFacultyDirectoryDataVersion", MEMBER_DATA_VERSION);
  }
}

let members = loadMembers();
let users = loadUsers();
let editingMemberId = null;
let photoData = "";
let saving = false;



let prototypeRole = "public";

function getPrototypeRole(){
  return prototypeRole;
}

function setPrototypeRole(role){
  prototypeRole = ["public","member","admin"].includes(role) ? role : "public";
  try{ localStorage.setItem("ICMTAPrototypeRole", prototypeRole); }catch(e){}
  applyRoleAccess();
  if(typeof renderManagement==="function" && document.getElementById("management")?.classList.contains("active")){
    renderManagement();
  }
}

function applyRoleAccess(){
  const role=prototypeRole;
  const pill=$("rolePill");
  const note=$("accessNote");

  if(pill) pill.textContent =
    role==="admin" ? "Administrator Access" :
    role==="member" ? "Member Access" :
    "Public Access";

  if(note) note.textContent =
    role==="admin"
      ? "Full member records and management actions are available."
      : role==="member"
        ? "Member-facing information is available; restricted administrative data is hidden."
        : "Limited member information is visible.";
}

function isAdminRole(){
  return prototypeRole==="admin";
}

function requireAdminRole(){ return true; }

function filterManagementQuality(type){
  const filterSelect=$("managementStatusFilter");
  if(filterSelect){
    if(type==="missing-photos") filterSelect.value="missing-photos";
    else if(type==="missing-info") filterSelect.value="missing-info";
    else if(type==="complete") filterSelect.value="complete";
    else if(type==="with-photos") filterSelect.value="with-photos";
    else filterSelect.value="";
  }
  if(type==="all"){
    const q=$("managementSearch");
    const d=$("managementDesignation");
    if(q) q.value="";
    if(d) d.value="";
  }
  renderManagement();
}

function clearManagementFilters(){
  const q=$("managementSearch");
  const d=$("managementDesignation");
  const s=$("managementStatusFilter");
  if(q) q.value="";
  if(d) d.value="";
  if(s) s.value="";
  renderManagement();
}

function managementNormalizeName(value){
  let s=String(value||"").trim();

  const prefixes=[
    /^lt\.?\s*dr\.?\s+/i,
    /^dr\.?\s+/i,
    /^mr\.?\s+/i,
    /^mrs\.?\s+/i,
    /^ms\.?\s+/i,
    /^miss\s+/i,
    /^prof\.?\s+/i,
    /^professor\s+/i
  ];

  let changed=true;
  while(changed){
    changed=false;
    for(const prefix of prefixes){
      const next=s.replace(prefix,"").trim();
      if(next!==s){
        s=next;
        changed=true;
      }
    }
  }

  // Ignore periods and punctuation when determining the first letter.
  s=s.replace(/[.]/g,"").trim();

  const match=s.match(/[A-Za-z]/);
  return match ? match[0].toUpperCase() : "#";
}


function renderMemberDetailsPage(member){
  const content = $("memberDetailsContent");
  const actionBtns = $("memberDetailsActionBtns");
  if(!content) return;

  const val = v => {
    if(v === null || v === undefined || String(v).trim() === "") {
      return '<span style="color:#94a3b8;font-style:italic">Not specified</span>';
    }
    if(Array.isArray(v)){
      const clean = v.map(x => String(x || "").trim()).filter(Boolean);
      return clean.length ? esc(clean.join(", ")) : '<span style="color:#94a3b8;font-style:italic">Not specified</span>';
    }
    return esc(String(v).trim());
  };

  const emailVal = v => {
    if(!v || !String(v).trim()) return '<span style="color:#94a3b8;font-style:italic">Not specified</span>';
    const clean = String(v).trim();
    return '<a href="mailto:'+esc(clean)+'" style="color:var(--blue);font-weight:600;text-decoration:none">'+esc(clean)+'</a>';
  };

  const linkVal = (v, prefix="") => {
    if(!v || !String(v).trim()) return '<span style="color:#94a3b8;font-style:italic">Not specified</span>';
    let raw = String(v).trim();
    let url = raw;
    if(!url.startsWith("http://") && !url.startsWith("https://")){
      url = prefix ? prefix + raw : "https://" + raw;
    }
    return '<a href="'+esc(url)+'" style="color:var(--blue);font-weight:600;text-decoration:underline;word-break:break-all">'+esc(raw)+' ↗</a>';
  };

  const photoHtml = member.photo && String(member.photo).trim()
    ? '<img src="'+member.photo+'" alt="'+esc(member.name)+'" style="width:160px;height:160px;aspect-ratio:1/1;object-fit:cover;object-position:center 15%;border-radius:14px;border:3px solid #dfe6ee;box-shadow:0 6px 18px rgba(13,53,84,0.1);display:block">'
    : '<div style="width:160px;height:160px;aspect-ratio:1/1;border-radius:14px;background:#eef4f8;border:2px dashed #cbd5df;display:flex;align-items:center;justify-content:center;color:#667085;font-size:14px;font-weight:700">No photo</div>';

  const hasPhoto = Boolean(String(member.photo || "").trim());
  const isComplete = [
    member.name, member.qualification, member.designation, member.department,
    member.college, member.state, member.country, member.expertise
  ].every(v => String(v ?? "").trim() !== "");

  const statusBadge = hasPhoto
    ? (isComplete ? '<span class="badge green" style="font-size:12px;padding:4px 10px">Complete Record</span>' : '<span class="badge" style="background:#eaf5fb;color:#126b9b;font-size:12px;padding:4px 10px">Missing Info</span>')
    : '<span class="badge" style="background:#fff7ed;color:#9a3412;font-size:12px;padding:4px 10px">No Photo</span>';

  if(actionBtns){
    actionBtns.innerHTML =
      '<button class="btn primary" type="button" onclick="editMember(\''+esc(member.id)+'\')">✏️ Edit Member</button>' +
      '<button class="btn danger" type="button" style="background:#fef2f2;color:#dc2626;border-color:#fecaca" onclick="deleteMember(\''+esc(member.id)+'\')">🗑️ Delete Member</button>';
  }

  const expList = Array.isArray(member.expertise)
    ? member.expertise.map(x => String(x || "").trim()).filter(Boolean)
    : String(member.expertise || "").split(",").map(x => x.trim()).filter(Boolean);

  const guideList = String(member.guideship || member.researchSupervisor || "").split(",").map(x => x.trim()).filter(Boolean);

  content.innerHTML =
    '<!-- Top Hero Card -->' +
    '<div style="background:linear-gradient(135deg, #f8fbfe 0%, #eef6fb 100%);border:1px solid #dfe6ee;border-radius:14px;padding:24px;margin-bottom:24px;display:flex;gap:24px;align-items:center;flex-wrap:wrap">' +
      '<div style="flex-shrink:0">' + photoHtml + '</div>' +
      '<div style="flex-grow:1;min-width:280px">' +
        '<div style="display:flex;align-items:center;gap:10px;margin-bottom:6px;flex-wrap:wrap">' +
          '<span style="font-size:13px;font-weight:800;color:var(--blue);background:#eaf5fb;padding:3px 10px;border-radius:6px;border:1px solid #c9e2f3">ID: ' + esc(member.id || "Not specified") + '</span>' +
          statusBadge +
        '</div>' +
        '<h1 style="font-size:26px;font-weight:800;color:var(--navy);margin:0 0 4px;letter-spacing:-0.4px">' +
          esc(member.title ? member.title + " " : "") + esc(member.name || "Member") +
        '</h1>' +
        '<div style="font-size:15px;font-weight:600;color:#334155;margin-bottom:6px">' +
          esc(member.designation || "Not specified") + ' &bull; ' + esc(member.qualification || "Not specified") +
        '</div>' +
        '<div style="font-size:14px;color:#64748b">' +
          esc(member.department || "Department Not Specified") + ' &bull; <b>' + esc(member.college || "Institution Not Specified") + '</b>' +
        '</div>' +
        '<div style="font-size:13px;color:#64748b;margin-top:4px">' +
          '📍 ' + esc([member.city, member.state, member.country].filter(Boolean).join(", ") || "Location Not Specified") +
        '</div>' +
      '</div>' +
    '</div>' +

    '<!-- 4 Structured Information Cards Grid -->' +
    '<div style="display:grid;grid-template-columns:1fr 1fr;gap:20px">' +

      '<!-- 1. Basic Information -->' +
      '<div class="panel" style="margin-bottom:0;padding:20px">' +
        '<h3 style="font-size:15px;font-weight:700;color:var(--navy);margin:0 0 16px;display:flex;align-items:center;gap:8px;border-bottom:1px solid #edf2f7;padding-bottom:10px">' +
          '🏛️ Basic Academic Information' +
        '</h3>' +
        '<div style="display:grid;grid-template-columns:1fr 1fr;gap:14px">' +
          '<div><div class="label" style="font-size:11px">Member ID</div><div style="font-size:13.5px;color:#1e293b;font-weight:600;margin-top:2px">' + val(member.id) + '</div></div>' +
          '<div><div class="label" style="font-size:11px">Title</div><div style="font-size:13.5px;color:#1e293b;margin-top:2px">' + val(member.title) + '</div></div>' +
          '<div style="grid-column:1/-1"><div class="label" style="font-size:11px">Full Name</div><div style="font-size:14px;font-weight:700;color:#0f172a;margin-top:2px">' + val(member.name) + '</div></div>' +
          '<div><div class="label" style="font-size:11px">Qualification</div><div style="font-size:13.5px;color:#1e293b;margin-top:2px">' + val(member.qualification) + '</div></div>' +
          '<div><div class="label" style="font-size:11px">Designation</div><div style="font-size:13.5px;color:#1e293b;margin-top:2px">' + val(member.designation) + '</div></div>' +
          '<div style="grid-column:1/-1"><div class="label" style="font-size:11px">Department</div><div style="font-size:13.5px;color:#1e293b;margin-top:2px">' + val(member.department) + '</div></div>' +
          '<div style="grid-column:1/-1"><div class="label" style="font-size:11px">Institution / Organization</div><div style="font-size:13.5px;color:#1e293b;font-weight:600;margin-top:2px">' + val(member.college) + '</div></div>' +
          '<div style="grid-column:1/-1"><div class="label" style="font-size:11px">College Address</div><div style="font-size:13.5px;color:#1e293b;margin-top:2px;line-height:1.5">' + val(member.collegeAddress) + '</div></div>' +
          '<div><div class="label" style="font-size:11px">Pincode</div><div style="font-size:13.5px;color:#1e293b;margin-top:2px">' + val(member.pincode) + '</div></div>' +
          '<div><div class="label" style="font-size:11px">Permanent Address Pincode</div><div style="font-size:13.5px;color:#1e293b;margin-top:2px">' + val(member.permanentPincode) + '</div></div>' +
          '<div><div class="label" style="font-size:11px">City</div><div style="font-size:13.5px;color:#1e293b;margin-top:2px">' + val(member.city) + '</div></div>' +
          '<div><div class="label" style="font-size:11px">State / Province</div><div style="font-size:13.5px;color:#1e293b;margin-top:2px">' + val(member.state) + '</div></div>' +
          '<div style="grid-column:1/-1"><div class="label" style="font-size:11px">Country</div><div style="font-size:13.5px;color:#1e293b;margin-top:2px">' + val(member.country || "India") + '</div></div>' +
        '</div>' +
      '</div>' +

      '<!-- Right Column: Research + Contact + Profiles -->' +
      '<div style="display:flex;flex-direction:column;gap:20px">' +

        '<!-- 2. Research Information -->' +
        '<div class="panel" style="margin-bottom:0;padding:20px">' +
          '<h3 style="font-size:15px;font-weight:700;color:var(--navy);margin:0 0 16px;display:flex;align-items:center;gap:8px;border-bottom:1px solid #edf2f7;padding-bottom:10px">' +
            '🔬 Research Information' +
          '</h3>' +
          '<div style="display:flex;flex-direction:column;gap:14px">' +
            '<div>' +
              '<div class="label" style="font-size:11px">Research Guideship</div>' +
              '<div style="font-size:13.5px;color:#1e293b;margin-top:4px">' +
                (guideList.length ? '<div style="display:flex;flex-wrap:wrap;gap:6px;margin-top:4px">' + guideList.map(g => '<span class="badge green" style="font-size:12px;padding:3px 8px">' + esc(g) + '</span>').join("") + '</div>' : val(member.guideship)) +
              '</div>' +
            '</div>' +
            '<div>' +
              '<div class="label" style="font-size:11px">Expertise</div>' +
              '<div style="font-size:13.5px;color:#1e293b;margin-top:4px">' +
                (expList.length ? '<div style="display:flex;flex-wrap:wrap;gap:6px;margin-top:4px">' + expList.map(e => '<span class="badge" style="background:#eaf5fb;color:#126b9b;font-size:12px;padding:3px 8px">' + esc(e) + '</span>').join("") + '</div>' : val(member.expertise)) +
              '</div>' +
            '</div>' +
          '</div>' +
        '</div>' +

        '<!-- 3. Contact Information -->' +
        '<div class="panel" style="margin-bottom:0;padding:20px">' +
          '<h3 style="font-size:15px;font-weight:700;color:var(--navy);margin:0 0 16px;display:flex;align-items:center;gap:8px;border-bottom:1px solid #edf2f7;padding-bottom:10px">' +
            '📞 Contact Information' +
          '</h3>' +
          '<div style="display:grid;grid-template-columns:1fr 1fr;gap:14px">' +
            '<div><div class="label" style="font-size:11px">Mobile</div><div style="font-size:13.5px;color:#1e293b;margin-top:2px">' + val(member.mobile) + '</div></div>' +
            '<div><div class="label" style="font-size:11px">WhatsApp</div><div style="font-size:13.5px;color:#1e293b;margin-top:2px">' + val(member.whatsapp) + '</div></div>' +
            '<div style="grid-column:1/-1"><div class="label" style="font-size:11px">Professional Email</div><div style="font-size:13.5px;margin-top:2px">' + emailVal(member.professionalEmail || member.email) + '</div></div>' +
            '<div style="grid-column:1/-1"><div class="label" style="font-size:11px">Personal Email</div><div style="font-size:13.5px;margin-top:2px">' + emailVal(member.personalEmail) + '</div></div>' +
          '</div>' +
        '</div>' +

        '<!-- 4. Online Profiles -->' +
        '<div class="panel" style="margin-bottom:0;padding:20px">' +
          '<h3 style="font-size:15px;font-weight:700;color:var(--navy);margin:0 0 16px;display:flex;align-items:center;gap:8px;border-bottom:1px solid #edf2f7;padding-bottom:10px">' +
            '🌐 Online Profiles' +
          '</h3>' +
          '<div style="display:flex;flex-direction:column;gap:12px">' +
            '<div><div class="label" style="font-size:11px">LinkedIn</div><div style="font-size:13px;margin-top:2px">' + linkVal(member.linkedin, "https://linkedin.com/in/") + '</div></div>' +
            '<div><div class="label" style="font-size:11px">ORCID</div><div style="font-size:13px;margin-top:2px">' + linkVal(member.orcid, "https://orcid.org/") + '</div></div>' +
            '<div><div class="label" style="font-size:11px">Google Scholar Profile</div><div style="font-size:13px;margin-top:2px">' + linkVal(member.scholar || member.googleScholar) + '</div></div>' +
          '</div>' +
        '</div>' +

      '</div>' +
    '</div>' +

    '<!-- Bottom Navigation Bar -->' +
    '<div style="margin-top:24px;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:12px;border-top:1px solid var(--line);padding-top:18px">' +
      '<button class="btn secondary" type="button" onclick="showPage(\'management\')" style="font-weight:700;padding:10px 20px;font-size:13.5px">' +
        '&larr; Back to Member Management' +
      '</button>' +
      '<button class="btn primary" type="button" onclick="editMember(\'' + esc(member.id) + '\')" style="font-weight:700;padding:10px 20px;font-size:13.5px">' +
        '✏️ Edit Member Information' +
      '</button>' +
    '</div>';
}

function viewManagementMember(id){
  const member = members.find(m => String(m.id).toUpperCase() === String(id).toUpperCase() || String(m.id) === String(id));
  if(!member){
    showToast("Member record not found.");
    return;
  }

  renderMemberDetailsPage(member);
  showPage("memberDetails");
  const mgmtBtn = document.querySelector('.nav button[data-page="management"]');
  if(mgmtBtn) mgmtBtn.classList.add("active");
}

function closeManagementMemberView(){
  showPage("management");
}


function updateDataQuality(){
  const total=members.length;

  const complete=members.filter(m=>{
    const required=[
      m.name,m.qualification,m.designation,m.department,
      m.college,m.state,m.country,m.expertise
    ];
    return required.every(v=>String(v??"").trim()!=="");
  }).length;

  const missingPhotos=members.filter(m=>!String(m.photo||"").trim()).length;

  const idCounts={};
  members.forEach(m=>{
    const id=String(m.id||"").trim().toUpperCase();
    if(id) idCounts[id]=(idCounts[id]||0)+1;
  });
  const duplicateIds=Object.values(idCounts).filter(count=>count>1).length;

  const missingFields=members.reduce((count,m)=>{
    const required=[
      m.name,m.qualification,m.designation,m.department,
      m.college,m.state,m.country,m.expertise
    ];
    return count + required.filter(v=>String(v??"").trim()==="").length;
  },0);

  const set=(id,value)=>{
    const el=$(id);
    if(el) el.textContent=String(value);
  };

  set("qualityTotal",total);
  set("qualityComplete",complete);
  set("qualityPhotos",missingPhotos);
  set("qualityMissing",missingFields);
  set("qualityDuplicateIds",duplicateIds);

  const status=$("dataQualityStatus");
  if(status){
    if(missingPhotos===0 && missingFields===0 && duplicateIds===0){
      status.textContent="Healthy";
      status.className="badge green";
    }else{
      status.textContent="Needs Review";
      status.className="badge";
      status.style.background="#fff7ed";
      status.style.color="#9a3412";
    }
  }
}


let importRecords=[];
let importIssues=[];

function openImportDialog(){
  const modal=$("importModal");
  if(!modal)return;
  modal.style.display="flex";
  modal.setAttribute("aria-hidden","false");
  resetImportState();
}
function closeImportDialog(){
  const modal=$("importModal");
  if(modal){modal.style.display="none";modal.setAttribute("aria-hidden","true");}
}
function resetImportState(){
  importRecords=[];importIssues=[];
  const input=$("importFile");if(input)input.value="";
  const name=$("importFileName");if(name)name.textContent="CSV or Excel file";
  ["importSummary","importIssues","importPreviewWrap","importActions"].forEach(id=>$(id)?.classList.add("hidden"));
  const btn=$("importCommitBtn");if(btn)btn.disabled=true;
}
function normalizeImportHeader(v){
  return String(v||"").trim().toLowerCase().replace(/[\s_\-\/]+/g,"").replace(/[()]/g,"");
}
const importFieldAliases={
 id:["id","memberid","ICMTAid","uniqueid","facultyid"],
 name:["name","membername","facultyname","fullname","facultymember"],
 qualification:["qualification","qualifications","degree"],
 designation:["designation","position","role"],
 department:["department","dept","discipline"],
 college:["college","collegename","institution","institutionorganization","organization","university"],
 collegeAddress:["collegeaddress","institutionaddress","address"],
 pincode:["pincode","pin","postalcode","collegepincode"],
 permanentPincode:["permanentpincode","permanentaddresspincode"],
 city:["city","district"],
 state:["state","stateprovince","province"],
 country:["country","countryname"],
 guideship:["guideship","researchguideship","supervisor","researchsupervisor"],
 expertise:["expertise","researcharea","researchareas","specialization","areaofexpertise"],
 mobile:["mobile","mobilenumber","phone","phonenumber","contact"],
 whatsapp:["whatsapp","whatsappnumber"],
 professionalEmail:["professionalemail","officialemail","workemail","email"],
 personalEmail:["personalemail","alternateemail"],
 linkedin:["linkedin","linkedinprofile","url"],
 orcid:["orcid","orcidprofile","orcidid"],
 scholar:["scholar","googlescholar","googlescholarprofile"],
 photo:["photo","photourl","photoimage","image","imageurl","photopath"]
};

function findImportField(headers,field){
  const aliases=importFieldAliases[field]||[field];
  return headers.find(h=>aliases.includes(normalizeImportHeader(h)))||null;
}

function mapImportRow(row,headers,rowNumber){
  const record={};
  Object.keys(importFieldAliases).forEach(field=>{
    const h=findImportField(headers,field);
    record[field]=h?String(row[h]??"").trim():"";
  });
  if(record.id){
    record.id=String(record.id).trim().toUpperCase();
  }
  return {record,rowNumber};
}

function generateImportNextId(currentMembers, allocatedIds){
  let max=0;
  for(const m of currentMembers){
    const n=parseInt(String(m.id||"").replace(/\D/g,""),10);
    if(Number.isFinite(n)) max=Math.max(max,n);
  }
  for(const id of allocatedIds){
    const n=parseInt(String(id).replace(/\D/g,""),10);
    if(Number.isFinite(n)) max=Math.max(max,n);
  }
  return "ICMTA"+String(max+1).padStart(3,"0");
}

function handleImportFile(input){
  const file=input?.files?.[0];if(!file)return;
  $("importFileName").textContent=file.name;
  const ext=(file.name.split(".").pop()||"").toLowerCase();
  if(ext==="csv"){
    const r=new FileReader();r.onload=()=>processImportRows(parseCSVText(String(r.result||"")));r.readAsText(file);
  }else if(ext==="xlsx"||ext==="xls")loadXLSXForImport(file);
  else showImportIssues(["Unsupported file type. Please select a CSV or Excel file."]);
}

function parseCSVText(text){
  const rows=[];let row=[],cell="",quoted=false;
  for(let i=0;i<text.length;i++){
    const ch=text[i],next=text[i+1];
    if(ch==='"'){if(quoted&&next==='"'){cell+='"';i++;}else quoted=!quoted;}
    else if(ch===','&&!quoted){row.push(cell);cell="";}
    else if((ch==='\n'||ch==='\r')&&!quoted){if(ch==='\r'&&next==='\n')i++;row.push(cell);cell="";if(row.some(v=>String(v).trim()!==""))rows.push(row);row=[];}
    else cell+=ch;
  }
  if(cell!==""||row.length){row.push(cell);if(row.some(v=>String(v).trim()!==""))rows.push(row);}
  if(!rows.length)return[];
  const headers=rows[0].map(v=>String(v||"").trim());
  return rows.slice(1).map(values=>{const o={};headers.forEach((h,i)=>o[h]=values[i]??"");return o;});
}

function loadXLSXForImport(file){
  if(window.XLSX){readXLSXImportFile(file);return;}
  const existing=document.querySelector('script[data-xlsx-import-loader]');
  if(existing){existing.addEventListener("load",()=>readXLSXImportFile(file),{once:true});return;}
  const script=document.createElement("script");
  script.src="https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js";
  script.dataset.xlsxImportLoader="true";
  script.onload=()=>readXLSXImportFile(file);
  script.onerror=()=>showImportIssues(["Excel support could not be loaded. Please use CSV."]);
  document.head.appendChild(script);
}

function readXLSXImportFile(file){
  const r=new FileReader();
  r.onload=e=>{try{
    const wb=XLSX.read(new Uint8Array(e.target.result),{type:"array"});
    const sheet=wb.Sheets[wb.SheetNames[0]];
    processImportRows(XLSX.utils.sheet_to_json(sheet,{defval:""}));
  }catch(err){console.error(err);showImportIssues(["The Excel file could not be read."]);}};
  r.readAsArrayBuffer(file);
}

function processImportRows(rows){
  importRecords=[];importIssues=[];
  if(!rows.length){showImportIssues(["The selected file contains no data rows."]);return;}
  const headers=Object.keys(rows[0]||{});
  if(!findImportField(headers,"name")&&!findImportField(headers,"id")){
    showImportIssues(["No recognizable Member ID or Name column was found in the file."]);return;
  }

  const allocatedIds = new Set();
  const seenFileKeys = new Map();
  const seenFileIds = new Map();

  rows.forEach((rawRow, i)=>{
    const rowNumber = i + 2;
    const mapped = mapImportRow(rawRow, headers, rowNumber);
    const r = mapped.record;
    const rawName = String(r.name || '').trim();
    const rawId = String(r.id || '').trim().toUpperCase();
    const email = normalize(r.professionalEmail || r.personalEmail);
    const phone = String(r.mobile || r.whatsapp || '').replace(/\D/g, '');
    const college = normalize(r.college);

    const normName = normalizeMemberNameForMatching(rawName);

    // 1. Validation: Missing name
    if(!rawName || normName.length < 2){
      importRecords.push({
        rowNumber,
        record: r,
        action: "error",
        reason: "Missing faculty name"
      });
      importIssues.push("Row " + rowNumber + ": Missing required faculty name (skipped)");
      return;
    }

    // Auto-match photo if not provided
    if(!r.photo && typeof matchPhotoToMember === "function"){
      const photoMatch = matchPhotoToMember(rawName, members);
      if(photoMatch && photoMatch.member && photoMatch.member.photo){
        r.photo = photoMatch.member.photo;
      }
    }

    // Composite deduplication key
    const personKey = email ? ("email:" + email) : phone && phone.length >= 10 ? ("phone:" + phone) : ("name:" + normName + "|college:" + college);

    // 2. Intra-file duplicate check
    if(rawId && seenFileIds.has(rawId)){
      const firstRow = seenFileIds.get(rawId);
      importRecords.push({
        rowNumber,
        record: r,
        action: "duplicate",
        reason: "Duplicate of Row " + firstRow + " (Same Member ID " + rawId + ")"
      });
      importIssues.push("Row " + rowNumber + ": Duplicate of Row " + firstRow + " (Same Member ID " + rawId + ") — Duplicate filtered out");
      return;
    }

    if(seenFileKeys.has(personKey)){
      const firstRow = seenFileKeys.get(personKey);
      importRecords.push({
        rowNumber,
        record: r,
        action: "duplicate",
        reason: "Duplicate of Row " + firstRow + " (" + rawName + ")"
      });
      importIssues.push("Row " + rowNumber + ": Duplicate of Row " + firstRow + " (" + rawName + ") — Duplicate filtered out");
      return;
    }

    // Register into seen maps for intra-file tracking
    if(rawId) seenFileIds.set(rawId, rowNumber);
    seenFileKeys.set(personKey, rowNumber);

    // 3. Database match detection
    let existing = null;
    let matchReason = "";

    if(rawId){
      existing = members.find(m => String(m.id).toUpperCase() === rawId);
      if(existing) matchReason = "Member ID " + rawId;
    }

    if(!existing && email){
      existing = members.find(m => normalize(m.professionalEmail) === email || normalize(m.personalEmail) === email);
      if(existing) matchReason = "Email (" + email + ")";
    }

    if(!existing && phone && phone.length >= 10){
      existing = members.find(m => String(m.mobile || '').replace(/\D/g, '') === phone);
      if(existing) matchReason = "Phone (" + phone + ")";
    }

    if(!existing && normName.length >= 4){
      existing = members.find(m => {
        const mn = normalizeMemberNameForMatching(m.name);
        const mc = normalize(m.college);
        return mn === normName && (college && mc ? (mc.includes(college) || college.includes(mc)) : true);
      });
      if(existing) matchReason = "Name & Institution match";
    }

    if(existing){
      r.id = existing.id;
      importRecords.push({
        rowNumber,
        record: r,
        action: "update",
        targetId: existing.id,
        reason: "Updates existing member " + existing.id + " (" + existing.name + ") via " + matchReason
      });
    } else {
      // Allocate clean unique sequential ID without collisions
      if(!rawId || !/^ICMTA\d{3,}$/.test(rawId) || members.some(m => String(m.id).toUpperCase() === rawId) || allocatedIds.has(rawId)){
        r.id = generateImportNextId(members, allocatedIds);
      } else {
        r.id = rawId;
      }
      allocatedIds.add(r.id);

      importRecords.push({
        rowNumber,
        record: r,
        action: "new",
        targetId: r.id,
        reason: "New unique member (Assigned ID: " + r.id + ")"
      });
    }
  });

  renderImportReview();
}

function renderImportReview(){
  const newRecords = importRecords.filter(x => x.action === "new");
  const updateRecords = importRecords.filter(x => x.action === "update");
  const duplicateRecords = importRecords.filter(x => x.action === "duplicate");
  const errorRecords = importRecords.filter(x => x.action === "error");
  const validTotal = newRecords.length + updateRecords.length;

  const summary=$("importSummary");
  if(summary){
    summary.classList.remove("hidden");
    summary.innerHTML=
      '<div class="import-stat"><div class="label">Total Rows</div><div class="value">'+importRecords.length+'</div></div>'+
      '<div class="import-stat"><div class="label">New Members</div><div class="value" style="color:#1d754e">'+newRecords.length+'</div></div>'+
      '<div class="import-stat"><div class="label">Updates (Merged)</div><div class="value" style="color:#126b9b">'+updateRecords.length+'</div></div>'+
      '<div class="import-stat"><div class="label">Duplicates Removed</div><div class="value" style="color:#b45309">'+duplicateRecords.length+'</div></div>'+
      '<div class="import-stat"><div class="label">Errors</div><div class="value" style="color:#b91c1c">'+errorRecords.length+'</div></div>';
  }

  const issues=$("importIssues");
  if(issues){
    if(importIssues.length){
      issues.classList.remove("hidden");
      issues.innerHTML='<b>Deduplication & Validation Details:</b><ul>'+importIssues.map(x=>'<li>'+esc(x)+'</li>').join("")+'</ul>';
    } else {
      issues.classList.add("hidden");
      issues.innerHTML="";
    }
  }

  const wrap=$("importPreviewWrap"),body=$("importPreviewBody");
  if(wrap&&body){
    wrap.classList.remove("hidden");
    body.innerHTML=importRecords.map(x=>{
      const r=x.record;
      const actionBadge = x.action === "new"
        ? '<span class="badge green">New Member</span>'
        : x.action === "update"
          ? '<span class="badge" style="background:#eaf5fb;color:#126b9b">Update (' + esc(x.targetId) + ')</span>'
          : x.action === "duplicate"
            ? '<span class="badge" style="background:#fff7ed;color:#9a3412">Duplicate Filtered</span>'
            : '<span class="badge red">Invalid Row</span>';

      const rowClass = x.action === "duplicate" ? "import-row-error" : x.action === "error" ? "import-row-error" : "";

      return '<tr class="'+rowClass+'">' +
        '<td>'+x.rowNumber+'</td>' +
        '<td>'+actionBadge+'</td>' +
        '<td><b>'+esc(r.id || "Pending")+'</b></td>' +
        '<td>'+esc(r.name||"Not specified")+'</td>' +
        '<td>'+esc(r.designation||"Not specified")+'</td>' +
        '<td>'+esc(r.college||"Not specified")+'</td>' +
        '<td><span style="font-size:12px;color:var(--muted)">'+esc(x.reason)+'</span></td>' +
        '</tr>';
    }).join("");
  }

  $("importActions")?.classList.remove("hidden");
  const btn=$("importCommitBtn");
  if(btn){
    btn.disabled = !validTotal;
    btn.textContent = validTotal ? "Import " + validTotal + " Clean Record" + (validTotal === 1 ? "" : "s") + (duplicateRecords.length ? " (" + duplicateRecords.length + " Duplicates Removed)" : "") : "Import Valid Records";
  }
}

function showImportIssues(messages){
  const issues=$("importIssues");
  if(issues){
    issues.classList.remove("hidden");
    issues.innerHTML='<b>Import could not continue:</b><ul>'+messages.map(x=>'<li>'+esc(x)+'</li>').join("")+'</ul>';
  }
  $("importPreviewWrap")?.classList.add("hidden");
  $("importActions")?.classList.add("hidden");
}

function commitImport(){
  const validRecords = importRecords.filter(x => x.action === "new" || x.action === "update");
  const duplicateCount = importRecords.filter(x => x.action === "duplicate").length;
  if(!validRecords.length){
    showToast("There are no valid records to import.");
    return;
  }

  let added=0, updated=0;
  validRecords.forEach(x=>{
    const r = { ...x.record, id: String(x.record.id).trim().toUpperCase() };
    const idx = members.findIndex(m => String(m.id||"").toUpperCase() === r.id);
    if(idx >= 0){
      const old = members[idx];
      members[idx] = {
        ...old,
        ...Object.fromEntries(Object.entries(r).filter(([_, v]) => String(v ?? "").trim() !== "")),
        photo: r.photo || old.photo || ""
      };
      updated++;
    } else {
      members.push(r);
      added++;
    }
  });

  persist();
  members = loadMembers();
  updateDashboard();
  renderDirectory();
  renderManagement();
  updateDataQuality();
  closeImportDialog();

  const msg = "Import complete: " + added + " added, " + updated + " updated" + (duplicateCount ? ", " + duplicateCount + " duplicate rows removed." : ".");
  showToast(msg);
}

/* =========================================================
   INTELLIGENT PHOTO AUTO-LINKER & BATCH UPLOADER
   ========================================================= */

function normalizeMemberNameForMatching(name) {
  return String(name || '')
    .toLowerCase()
    .replace(/^(?:lt\.?\s*dr\.?|dr\.?|mr\.?|mrs\.?|ms\.?|miss|prof\.?|professor)\s+/i, '')
    .replace(/[^a-z0-9]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function matchPhotoToMember(filename, memberList) {
  if (!filename) return null;
  const raw = String(filename).replace(/\\/g, '/');
  const base = raw.split('/').pop().replace(/\.[^/.]+$/, '');
  
  // 1. Explicit ICMTA ID in filename (e.g. ICMTA107.jpg, ICMTA-001.png, ICMTA_045.jpeg)
  const ICMTAMatch = base.match(/ICMTA[\-_]?(\d+)/i);
  if (ICMTAMatch) {
    const num = parseInt(ICMTAMatch[1], 10);
    const targetId = 'ICMTA' + String(num).padStart(3, '0');
    const member = memberList.find(m => String(m.id).toUpperCase() === targetId);
    if (member) {
      return { member, reason: 'Member ID (' + targetId + ')', confidence: 1.0 };
    }
  }

  // 2. Extract name part from filename (stripping numeric prefixes like 001_, 123-, etc.)
  let cleanName = base
    .replace(/^(?:ICMTA[\-_]?\d+|\d{1,4})[_\-\s]*/i, '')
    .replace(/[_\-]+/g, ' ')
    .trim();
  
  const normFile = normalizeMemberNameForMatching(cleanName);

  // 3. Name matching:
  if (normFile && normFile.length >= 3) {
    // Exact normalized name match
    let matched = memberList.find(m => normalizeMemberNameForMatching(m.name) === normFile);
    if (matched) {
      return { member: matched, reason: 'Faculty Name Match ("' + matched.name + '")', confidence: 0.98 };
    }

    // Substring / contained name match
    matched = memberList.find(m => {
      const mn = normalizeMemberNameForMatching(m.name);
      return mn && (mn === normFile || mn.includes(normFile) || normFile.includes(mn));
    });
    if (matched) {
      return { member: matched, reason: 'Faculty Name Match ("' + matched.name + '")', confidence: 0.90 };
    }

    // Multi-token overlap matching (at least 2 matching significant words)
    const fileTokens = normFile.split(' ').filter(t => t.length > 2);
    if (fileTokens.length >= 2) {
      let best = null;
      let maxOverlap = 0;
      memberList.forEach(m => {
        const mnTokens = new Set(normalizeMemberNameForMatching(m.name).split(' '));
        const overlap = fileTokens.filter(t => mnTokens.has(t)).length;
        if (overlap > maxOverlap && overlap >= Math.min(2, fileTokens.length)) {
          maxOverlap = overlap;
          best = m;
        }
      });
      if (best && maxOverlap >= 2) {
        return { member: best, reason: 'Key Name Tokens ("' + best.name + '")', confidence: 0.80 };
      }
    }
  }

  // 4. Fallback: Check if filename is purely numeric (e.g. 107.jpg, 001.png)
  const onlyNumMatch = base.match(/^(\d{1,4})$/);
  if (onlyNumMatch) {
    const num = parseInt(onlyNumMatch[1], 10);
    const targetId = 'ICMTA' + String(num).padStart(3, '0');
    const member = memberList.find(m => String(m.id).toUpperCase() === targetId);
    if (member) {
      return { member, reason: 'Numeric ID fallback (' + targetId + ')', confidence: 0.70 };
    }
  }

  return null;
}

let photoSyncItems = [];

function openPhotoSyncDialog(){
  const modal = $("photoSyncModal");
  if(!modal) return;
  modal.style.display = "flex";
  modal.setAttribute("aria-hidden", "false");
  resetPhotoSyncState();
}

function closePhotoSyncDialog(){
  const modal = $("photoSyncModal");
  if(modal){
    modal.style.display = "none";
    modal.setAttribute("aria-hidden", "true");
  }
}

function resetPhotoSyncState(){
  photoSyncItems = [];
  const input = $("bulkPhotoInput");
  if(input) input.value = "";
  const countEl = $("bulkPhotoCount");
  if(countEl) countEl.textContent = "No files selected";
  ["photoSyncSummary", "photoSyncIssues", "photoSyncPreviewWrap", "photoSyncActions"].forEach(id => $(id)?.classList.add("hidden"));
  const btn = $("photoSyncCommitBtn");
  if(btn) btn.disabled = true;
}

function handleBulkPhotoSelect(input){
  const files = Array.from(input?.files || []);
  if(!files.length) return;
  
  const countEl = $("bulkPhotoCount");
  if(countEl) countEl.textContent = files.length + " file" + (files.length === 1 ? "" : "s") + " selected";
  photoSyncItems = [];

  let loaded = 0;
  files.forEach(file => {
    const reader = new FileReader();
    reader.onload = e => {
      const dataUrl = e.target.result;
      const match = matchPhotoToMember(file.name, members);
      photoSyncItems.push({
        filename: file.name,
        dataUrl: dataUrl,
        match: match,
        memberId: match ? match.member.id : null,
        memberName: match ? match.member.name : null,
        reason: match ? match.reason : "No match found",
        status: match ? (match.member.photo ? "replace" : "new") : "unmatched"
      });
      loaded++;
      if(loaded === files.length){
        renderPhotoSyncReview();
      }
    };
    reader.readAsDataURL(file);
  });
}

function renderPhotoSyncReview(){
  const matched = photoSyncItems.filter(x => x.memberId);
  const unmatched = photoSyncItems.filter(x => !x.memberId);
  const replaceCount = matched.filter(x => x.status === "replace").length;
  const newCount = matched.filter(x => x.status === "new").length;

  const summary = $("photoSyncSummary");
  if(summary){
    summary.classList.remove("hidden");
    summary.innerHTML =
      '<div class="import-stat"><div class="label">Total Photos</div><div class="value">' + photoSyncItems.length + '</div></div>' +
      '<div class="import-stat"><div class="label">Matched (New)</div><div class="value" style="color:#1d754e">' + newCount + '</div></div>' +
      '<div class="import-stat"><div class="label">Matched (Replace)</div><div class="value" style="color:#126b9b">' + replaceCount + '</div></div>' +
      '<div class="import-stat"><div class="label">Unmatched</div><div class="value" style="color:#9a3412">' + unmatched.length + '</div></div>';
  }

  const issues = $("photoSyncIssues");
  if(issues){
    if(unmatched.length){
      issues.classList.remove("hidden");
      issues.innerHTML = '<b>' + unmatched.length + ' photo' + (unmatched.length === 1 ? '' : 's') + ' could not be auto-matched:</b><ul>' +
        unmatched.map(x => '<li><b>' + esc(x.filename) + '</b> — rename with faculty name or Member ID (e.g. ICMTA107.jpg) to match</li>').join("") +
        '</ul>';
    } else {
      issues.classList.add("hidden");
      issues.innerHTML = "";
    }
  }

  const wrap = $("photoSyncPreviewWrap");
  const body = $("photoSyncPreviewBody");
  if(wrap && body){
    wrap.classList.remove("hidden");
    body.innerHTML = photoSyncItems.map(item => {
      const thumb = '<img src="' + item.dataUrl + '" style="width:42px;height:42px;border-radius:6px;object-fit:cover;border:1px solid #d0d7de;vertical-align:middle" alt="preview">';
      const statusBadge = item.status === "new"
        ? '<span class="badge green">Ready to Link</span>'
        : item.status === "replace"
          ? '<span class="badge" style="background:#eaf5fb;color:#126b9b">Replace Existing</span>'
          : '<span class="badge" style="background:#fff7ed;color:#9a3412">Unmatched</span>';

      const memberInfo = item.memberId
        ? '<b>' + esc(item.memberId) + '</b> — ' + esc(item.memberName)
        : '<span style="color:var(--muted)">No member matched</span>';

      return '<tr>' +
        '<td>' + thumb + '</td>' +
        '<td><b>' + esc(item.filename) + '</b></td>' +
        '<td>' + memberInfo + '</td>' +
        '<td><span style="font-size:12px;color:var(--muted)">' + esc(item.reason) + '</span></td>' +
        '<td>' + statusBadge + '</td>' +
        '</tr>';
    }).join("");
  }

  $("photoSyncActions")?.classList.remove("hidden");
  const btn = $("photoSyncCommitBtn");
  if(btn){
    btn.disabled = !matched.length;
    btn.textContent = matched.length ? "Apply " + matched.length + " Photo" + (matched.length === 1 ? "" : "s") : "Apply Photos";
  }
}

function commitPhotoSync(){
  const matched = photoSyncItems.filter(x => x.memberId);
  if(!matched.length){
    showToast("No matched photos to apply.");
    return;
  }

  let count = 0;
  matched.forEach(item => {
    const member = members.find(m => String(m.id).toUpperCase() === String(item.memberId).toUpperCase());
    if(member){
      member.photo = item.dataUrl;
      count++;
    }
  });

  persist();
  members = loadMembers();
  updateDashboard();
  renderDirectory();
  renderManagement();
  updateDataQuality();
  closePhotoSyncDialog();
  showToast("Successfully linked " + count + " photo" + (count === 1 ? "" : "s") + " to members.");
}

function exportUpdatedMemberDataJS(){
  const content = 'window.ICMTA_MASTER_DATA = ' + JSON.stringify(members) + ';\n';
  const blob = new Blob([content], { type: 'text/javascript;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'member-data.js';
  a.click();
  URL.revokeObjectURL(url);
  showToast("Downloaded updated member-data.js file.");
}

function renderManagement(){
  const body=$("managementBody");
  if(!body || typeof members==="undefined") return;
  updateDataQuality();

  const q=normalize($("managementSearch")?.value);
  const designation=$("managementDesignation")?.value||"";
  const statusFilter=$("managementStatusFilter")?.value||"";

  const list=members.filter(m=>{
    const searchable=[
      m.id,m.name,m.designation,m.college,m.department,
      m.city,m.state,m.country,m.qualification,m.professionalEmail,m.mobile,m.expertise
    ].filter(Boolean).join(" ").toLowerCase();

    let searchMatch=true;

    if(q){
      if(/^[a-z]$/i.test(q)){
        searchMatch=managementNormalizeName(m.name)===q.toUpperCase();
      }else{
        searchMatch=searchable.includes(q);
      }
    }

    const hasPhoto=Boolean(String(m.photo||"").trim());
    const isComplete=[
      m.name,m.qualification,m.designation,m.department,
      m.college,m.state,m.country,m.expertise
    ].every(v=>String(v??"").trim()!=="");

    let statusMatch=true;
    if(statusFilter==="missing-photos") statusMatch=!hasPhoto;
    else if(statusFilter==="with-photos") statusMatch=hasPhoto;
    else if(statusFilter==="missing-info") statusMatch=!isComplete;
    else if(statusFilter==="complete") statusMatch=isComplete;

    return searchMatch
      && (!designation || m.designation===designation)
      && statusMatch;
  });

  if(!list.length){
    body.innerHTML="";
    $("managementEmpty")?.classList.remove("hidden");
    return;
  }

  $("managementEmpty")?.classList.add("hidden");

  body.innerHTML=list.map(m=>{
    const photo=m.photo
      ? '<img class="thumb" src="'+m.photo+'" alt="Member photo">'
      : '<span class="thumb-placeholder">No photo</span>';

    const hasPhoto=Boolean(String(m.photo||"").trim());
    const isComplete=[
      m.name,m.qualification,m.designation,m.department,
      m.college,m.state,m.country,m.expertise
    ].every(v=>String(v??"").trim()!=="");

    const statusBadge = hasPhoto
      ? (isComplete ? '<span class="badge green">Complete</span>' : '<span class="badge" style="background:#eaf5fb;color:#126b9b">Missing Info</span>')
      : '<span class="badge" style="background:#fff7ed;color:#9a3412">No Photo</span>';

    return '<tr>'
      +'<td class="management-photo">'+photo+'</td>'
      +'<td class="management-id"><b>'+esc(m.id||"Not specified")+'</b></td>'
      +'<td><div class="management-name">'+esc(m.name||"Not specified")+'</div></td>'
      +'<td>'+esc(m.designation||"Not specified")+'</td>'
      +'<td>'+esc(m.college||"Not specified")+'</td>'
      +'<td class="management-qualification">'+esc(m.qualification||"Not specified")+'</td>'
      +'<td>'+statusBadge+'</td>'
      +'<td><div class="management-actions" style="display:flex;gap:4px;flex-wrap:wrap">'
      +'<button class="btn secondary" style="padding:4px 8px;font-size:12px" type="button" onclick="viewManagementMember(\''+esc(m.id)+'\')">View</button>'
      +'<button class="btn primary" style="padding:4px 8px;font-size:12px" type="button" onclick="editMember(\''+esc(m.id)+'\')">Edit</button>'
      +'<button class="btn danger" style="padding:4px 8px;font-size:12px;background:#fef2f2;color:#dc2626;border-color:#fecaca" type="button" onclick="deleteMember(\''+esc(m.id)+'\')">Delete</button>'
      +'</div></td>'
      +'</tr>';
  }).join("");
}

async function deleteMember(id){
  const member = members.find(m => String(m.id).toUpperCase() === String(id).toUpperCase());
  if(!member){
    showToast("Member record not found.");
    return;
  }
  const confirmed = confirm("Are you sure you want to permanently delete member " + member.id + " (" + member.name + ")?");
  if(!confirmed) return;
const token = localStorage.getItem("ICMTAdminToken");
  if(!token){
    alert("Admin session expired. Please log in again.");
    return;
  }
  try {
    const response = await fetch(`${API_BASE_URL}/api/admin/members/${encodeURIComponent(member.id)}`, {
      method: "DELETE",
      headers: {
        "Authorization": `Bearer ${token}`
      }
    });
    const result = await response.json();
    if(!response.ok || !result.success){
      throw new Error(result.error || "Failed to delete member.");
    }
    // Pull the fresh table directly from the database
    members = await loadMembersFromBackend();
    persist();
    updateDashboard();
    renderManagement();
    updateDataQuality();
    showToast("Member " + id + " permanently deleted from database.");
  } catch(err) {
    console.error("Delete failed:", err);
    alert(err.message || "Failed to delete member.");
  }
}

function editMember(id){
  const member=members.find(m=>String(m.id)===String(id));
  if(!member){
    showToast("Member record not found.");
    return;
  }

  editingMemberId=String(member.id);
  photoData=member.photo||"";
  showPage("add");

  const form=$("adminForm");
  if(!form) return;

  if(!form.dataset) form.dataset = {};
  form.dataset.editingId=member.id;
  const set=(name,value)=>{
    const field=form.elements[name];
    if(field) field.value=value||"";
  };

  set("title",member.title||"Dr.");
  set("name",member.name);
  set("qualification",member.qualification);
  set("designation",member.designation);
  set("department",member.department);
  set("college",member.college);
  set("collegeAddress",member.collegeAddress);
  set("pincode",member.pincode||member.collegePincode);
  set("permanentPincode",member.permanentPincode);
  set("state",member.state);
  set("country",member.country);
  set("guideship",member.guideship||member.researchSupervisor);
  set("expertise",Array.isArray(member.expertise)?member.expertise.join(", "):member.expertise);
  set("mobile",member.mobile);
  set("whatsapp",member.whatsapp);
  set("professionalEmail",member.professionalEmail);
  set("personalEmail",member.personalEmail);
  set("linkedin",member.linkedin);
  set("orcid",member.orcid);
  set("scholar",member.scholar);

  if(form.elements.name && !member.title){
    const match=String(member.name||"").match(/^(Dr\.|Mr\.|Ms\.|Mrs\.)\s+(.*)$/i);
    if(match){
      form.elements.title.value=match[1];
      form.elements.name.value=match[2];
    }
  }

  const heading=$("addHeading");
  if(heading) heading.textContent="Edit Member — "+member.id;

  const save=$("adminSaveBtn");
  if(save){
    save.textContent="Update Member";
    save.type="submit";
  }

  const preview=$("adminPhoto");
  if(preview){
    preview.innerHTML=member.photo
      ? '<img src="'+member.photo+'" alt="Current member photo">'
      : "Photo preview";
  }
}

function resetAdminForm(){
  const form=$("adminForm");
  if(!form) return;
  form.reset();
  delete form.dataset.editingId;
  editingMemberId=null;
  photoData="";
  const heading=$("addHeading");
  if(heading) heading.textContent="Manual Member Entry";
  const save=$("adminSaveBtn");
  if(save){
    save.textContent="Save Member & Generate ID";
    save.type="submit";
  }
  const preview=$("adminPhoto");
  if(preview) preview.textContent="Photo preview";
}

function exportMembersCSV(){
  

  if(typeof members==="undefined") return;

  const headers=[
    "Member ID","Name","Qualification","Designation","Department",
    "Institution / Organization","City","State / Province","Country",
    "Research Guideship","Expertise","Mobile","WhatsApp",
    "Professional Email","Personal Email","LinkedIn","ORCID","Google Scholar"
  ];

  const escCSV=value=>{
    const text=Array.isArray(value)?value.join(", "):String(value??"");
    return '"'+text.replace(/"/g,'""')+'"';
  };

  const rows=members.map(m=>[
    m.id,m.name,m.qualification,m.designation,m.department,m.college,
    m.city,m.state,m.country,m.guideship||m.researchSupervisor,
    m.expertise,m.mobile,m.whatsapp,m.professionalEmail,m.personalEmail,
    m.linkedin,m.orcid,m.scholar
  ].map(escCSV).join(","));

  const blob=new Blob([[headers.map(escCSV).join(","),...rows].join("\r\n")],{type:"text/csv;charset=utf-8"});
  const url=URL.createObjectURL(blob);
  const a=document.createElement("a");
  a.href=url;
  a.download="ICMTA_Faculty_Member_Data.csv";
  a.click();
  URL.revokeObjectURL(url);
  showToast("Member data exported as CSV.");
}

function loadXLSXForExport(callback){
  if(window.XLSX){ callback(); return; }

  const existing=document.querySelector('script[data-xlsx-export-loader]');
  if(existing){
    existing.addEventListener("load",callback,{once:true});
    existing.addEventListener("error",()=>exportMembersCSV(),{once:true});
    return;
  }

  const script=document.createElement("script");
  script.src="https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js";
  script.dataset.xlsxExportLoader="true";
  script.onload=callback;
  script.onerror=()=>{
    showToast("Excel library could not be loaded. CSV export is available.");
    exportMembersCSV();
  };
  document.head.appendChild(script);
}

function exportMembersExcel(){
  if(typeof members==="undefined") return;

  loadXLSXForExport(()=>{
    if(!window.XLSX){
      exportMembersCSV();
      return;
    }

    const headers=[
      "Member ID","Name","Qualification","Designation","Department",
      "Institution / Organization","City","State / Province","Country",
      "Research Guideship","Expertise","Mobile","WhatsApp",
      "Professional Email","Personal Email","LinkedIn","ORCID","Google Scholar"
    ];

    const rows=members.map(m=>[
      m.id,m.name,m.qualification,m.designation,m.department,m.college,
      m.city,m.state,m.country,m.guideship||m.researchSupervisor,
      m.expertise,m.mobile,m.whatsapp,m.professionalEmail,m.personalEmail,
      m.linkedin,m.orcid,m.scholar
    ]);

    const worksheet=XLSX.utils.aoa_to_sheet([headers,...rows]);
    const workbook=XLSX.utils.book_new();

    XLSX.utils.book_append_sheet(workbook,worksheet,"Faculty Data");

    // Improve readability in Excel.
    worksheet["!cols"]=headers.map((h,i)=>{
      const max=Math.max(
        h.length,
        ...rows.slice(0,100).map(row=>String(row[i]??"").length)
      );
      return {wch:Math.min(Math.max(max+2,12),40)};
    });

    XLSX.writeFile(workbook,"ICMTA_Faculty_Member_Data.xlsx");
    showToast("Member data exported as Excel.");
  });
}

function $(id){ return document.getElementById(id); }

function esc(value){
  return String(value ?? "").replace(/[&<>"]/g, c=>({
    "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"
  }[c]));
}

function initials(name){
  return String(name||"").trim().split(/\s+/).filter(Boolean).slice(-2).map(x=>x[0]).join("").toUpperCase();
}

function normalize(value){
  return String(value||"").trim().toLowerCase();
}

function loadMembers(){
  try{
    const raw=localStorage.getItem(MEMBER_STORE_KEY);
    const parsed=raw ? JSON.parse(raw) : [];
    return dedupeMembers(Array.isArray(parsed)?parsed:[]);
  }catch(e){
    console.error(e);
    return [];
  }
}

async function loadMembersFromBackend() {
    try {
        
const adminToken = localStorage.getItem("ICMTAdminToken");

if (!adminToken) {
    throw new Error("Admin session token not found. Please sign in again.");
}

const apiBase = (
    typeof getApiBase === "function"
        ? getApiBase()
        : (typeof API_BASE_URL !== "undefined"
            ? API_BASE_URL
            : "http://localhost:5000")
).replace(/\/+$/, "");

const response = await fetch(`${apiBase}/api/members`, {
    method: "GET",
    headers: {
        "Authorization": `Bearer ${adminToken}`
    }
});

let result;
try {
    result = await response.json();
} catch (e) {
    throw new Error("The members API returned an invalid response.");
}

if (!response.ok || !result || result.success === false) {
    throw new Error(
        (result && (result.detail || result.message || result.error)) ||
        `Failed to load members (${response.status})`
    );
}

if (!Array.isArray(result.data)) {
    throw new Error("Invalid members API response.");
}


        return result.data.map(member => {
            let photo = member.photo_url || "";

            const memberId = String(member.member_id || "")
                .trim()
                .toUpperCase();

            const memberName = String(member.name || "").trim();

            const normalizePhotoName = value =>
                String(value || "")
                    .toLowerCase()
                    .replace(/^(dr|prof|mr|mrs|ms|miss)\.?\s*/i, "")
                    .replace(/[^a-z0-9]+/g, "");

            if (!photo && window.ICMTA_MEMBER_PHOTO_MAP) {
                photo = window.ICMTA_MEMBER_PHOTO_MAP[memberId] || "";
            }

            if (!photo && window.ICMTA_MEMBER_NAME_PHOTO_MAP) {
                photo =
                    window.ICMTA_MEMBER_NAME_PHOTO_MAP[
                        normalizePhotoName(memberName)
                    ] || "";
            }

            if (
                photo &&
                (photo.startsWith("/uploads/") ||
                 photo.startsWith("/images/"))
            ) {
                photo = `${apiBase}${photo}`;
            }

            return {
                id: member.member_id,
                name: member.name,
                academicTitle: member.academic_title || "",
                qualification: member.qualification || "",
                designation: member.designation || "",
                department: member.department || "",
                college: member.institution || "",
                city: member.city || "",
                state: member.state_province || "",
                country: member.country || "India",
                expertise: member.expertise || "",
                photo: photo,
                guideship:
                    member.research_guideship || member.guideship || "",
                researchSupervisor:
                    member.research_guideship ||
                    member.researchSupervisor || "",
                collegeAddress:
                    member.address || member.collegeAddress || "",
                mobile: member.mobile || "",
                professionalEmail:
                    member.professional_email ||
                    member.professionalEmail || "",
                personalEmail:
                    member.personal_email || member.personalEmail || "",
                isActive: member.is_active,
                status: member.my_status
            };
        });
    } catch (error) {
        console.error("Backend member loading failed:", error);

        // Do not silently hide authentication or backend failures as zero members.
        throw error;
    }
}
// Load users from localStorage or return default users if not found.
function loadUsers(){
  try{
    const raw=localStorage.getItem(USER_STORE_KEY);
    const parsed=raw ? JSON.parse(raw) : null;
    if(Array.isArray(parsed)) return parsed;
  }catch(e){}
  return [
    {name:"Admin User",role:"Administrator",status:"Active",access:"Included"},
    {name:"Data Entry User 1",role:"Data Entry",status:"Active",access:"Included"},
    {name:"Data Entry User 2",role:"Data Entry",status:"Active",access:"Excluded"}
  ];
}

// Deduplicate members by ID and normalized key (name|college|designation|state).
function dedupeMembers(list){
  const byId=new Set();
  const byKey=new Set();
  const result=[];
  const seenAlokKumar=false;
  let alokSeen=false;

  for(const m of list){
    const id=String(m.id||"").trim();
    const rawName=String(m.name||"").trim();
    const normalizedName=rawName
      .replace(/^(?:dr|mr|mrs|ms|miss|prof|professor)\\.?\\s+/i,"")
      .replace(/\\./g,"")
      .replace(/\\s+/g," ")
      .trim()
      .toLowerCase();

    // ICMTA source data contains two records for Alok Kumar in older
    // localStorage versions. Keep the first valid record only.
    if(normalizedName==="alok kumar"){
      if(alokSeen) continue;
      alokSeen=true;
    }

    const key=[normalize(m.name),normalize(m.college),normalize(m.designation),normalize(m.state)].join("|");

    if(id){
      if(byId.has(id)) continue;
      byId.add(id);
    }

    if(byKey.has(key)) continue;
    byKey.add(key);
    result.push(m);
  }
  return result;
}
// Save members and users to localStorage.
function persist(){
  members=dedupeMembers(members);
  localStorage.setItem(MEMBER_STORE_KEY,JSON.stringify(members));
  localStorage.setItem(USER_STORE_KEY,JSON.stringify(users));
}
// Display a temporary toast notification message.
function toast(message){
  const el=$("toast");
  if(!el) return;
  el.textContent=message;
  el.style.display="block";
  clearTimeout(el._timer);
  el._timer=setTimeout(()=>el.style.display="none",2800);
}
const showToast = toast;

// Remove the "Directory" and "Profile" buttons from the admin sidebar.
function removeAdminSidebarButtons(){
  const dirBtn=document.querySelector('.nav button[data-page="directory"]');
  if(dirBtn) dirBtn.remove();
  const profileBtn=document.querySelector('.nav button[data-page="profile"]');
  if(profileBtn) profileBtn.remove();
}
// Handle admin login form submission.
async function login(){

  try {

    const user_id = $("loginEmail").value.trim();
    const password = $("loginPassword").value;

    if(!user_id || !password){
      alert("Please enter your user ID and password.");
      return;
    }

    const result = await adminLogin(user_id, password);

    localStorage.setItem("ICMTAdminToken", result.token);

    members = await loadMembersFromBackend();

    console.log("Admin backend members loaded:", members.length);

    removeAdminSidebarButtons();

    $("login").classList.add("hidden");

    $("public").classList.add("hidden");

    $("app").classList.remove("hidden");

    updateDashboard();

    renderUsers();

    showPage("dashboard");

  } catch(error) {

    console.error("Admin login failed:", error);

    alert(error.message || "Login failed.");

  }

}

// Handle admin logout and clear session data.
function logout(){
  if($("loginEmail")) $("loginEmail").value = "";
  if($("loginPassword")) $("loginPassword").value = "";
  $("app").classList.add("hidden");
  $("public").classList.add("hidden");
  $("login").classList.remove("hidden");
}
// Show the public directory view and hide admin login/app.
function openPublic(){
  $("login").classList.add("hidden");
  $("app").classList.add("hidden");
  $("public").classList.remove("hidden");
}

//
function backLogin(){
  $("public").classList.add("hidden");
  $("login").classList.remove("hidden");
}

const pageTitles={
  dashboard:"Dashboard",
  management:"Member Management",
  directory:"Faculty Directory",
  add:"Add Member (Manual)",
  profile:"Member Profile",
  memberDetails:"Member Details",
  users:"User Management",
  "membership-applications":"Membership Applications",
  advertisements: "Advertisements",
  reports: "Reports & Analytics"
};

/*CSV export function*/
/**
 * Exports report data as a CSV file for spreadsheet analysis.
 * Includes membership, payment, category, and monthly revenue data.
 */
function exportAdminReportsCsv() {
  const rows = window.adminReportsData;

  if (!rows) {
    alert("Load Reports & Analytics before exporting.");
    return;
  }

  const csvRows = [
    ["Report Section", "Month", "Category", "Currency", "Status",
      "Transactions", "Amount", "Count"],

    ...rows.payments_by_status.map(row => [
      "Payments by Status", "", "", row.currency, row.status,
      row.transaction_count, row.total_amount, ""
    ]),

    ...rows.paid_payments_by_category.map(row => [
      "Paid Payments by Category", "", row.membership_category,
      row.currency, "Paid", row.transaction_count, row.total_amount, ""
    ]),

    ...rows.members_by_category.map(row => [
      "Members by Category", "", row.membership_category, "", "", "", "",
      row.count
    ]),

    ...rows.monthly_revenue.map(row => [
      "Monthly Revenue", row.month, "", row.currency, "Paid",
      row.transaction_count, row.total_amount, ""
    ]),

    ["Total Members", "", "", "", "", "", "", rows.total_members]
  ];

  // Escape commas, quotes, and line breaks safely for CSV.
  const csv = csvRows.map(row =>
    row.map(value => {
      const text = String(value ?? "");
      return `"${text.replace(/"/g, '""')}"`;
    }).join(",")
  ).join("\r\n");

  const blob = new Blob(["\uFEFF" + csv], {
    type: "text/csv;charset=utf-8;"
  });

  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");

  link.href = url;
  link.download = "icmta-admin-reports.csv";
  link.click();

  URL.revokeObjectURL(url);
}


/**
 * Loads Reports & Analytics data from the admin API
 * and updates the report summary cards and tables.
 */
async function loadAdminReports() {
  const message = $("reportsMessage");

  try {
    if (message) message.textContent = "Loading reports...";

    const token = localStorage.getItem("ICMTAdminToken");

    const API_BASE_URL = "http://localhost:5000";

// Fetch Admin Reports with Optional Date Filters
// Reads the selected start and end dates, adds them as query parameters,
// and requests filtered report data from the backend using the admin token.


const startDate = document.getElementById("reportStartDate")?.value;
const endDate = document.getElementById("reportEndDate")?.value;

const params = new URLSearchParams();

if (startDate) params.set("startDate", startDate);
if (endDate) params.set("endDate", endDate);

const queryString = params.toString();
const reportsUrl = `${API_BASE_URL}/api/admin/reports/overview${
  queryString ? `?${queryString}` : ""
}`;

const response = await fetch(reportsUrl, {
  headers: {
    Authorization: `Bearer ${token}`
  }
});

    if (!response.ok) {
      throw new Error(`Failed to load reports (HTTP ${response.status})`);
    }

    const result = await response.json();

    if (!result.success) {
      throw new Error("The reports API returned an unsuccessful response.");
    }

    const data = result.data;

    // Retain the latest report response for CSV export.
window.adminReportsData = data;

    // Calculate application counts by approval status.
    const applicationCount = status =>
      (data.applications || [])
        .filter(row => row.status === status)
        .reduce((total, row) => total + row.count, 0);

    // Calculate payment counts by status across currencies.
    const paymentCount = status =>
      (data.payments_by_status || [])
        .filter(row => row.status === status)
        .reduce((total, row) => total + row.transaction_count, 0);
    // Display new member registrations within the selected date range.
const newMembers = (data.monthly_membership_growth || [])
  .reduce((total, row) => total + Number(row.new_members || 0), 0);


    // Update summary cards.
    $("reportTotalMembers").textContent = data.total_members;// Display the total number of members.
    $("reportApprovedApps").textContent = applicationCount("Approved");// Display the count of approved membership applications.
    $("reportPendingPayments").textContent = paymentCount("Pending");// Display the count of paid transactions.
    $("reportPaidTransactions").textContent = paymentCount("Paid");// Display the count of new member registrations.
    $("reportNewMembers").textContent = newMembers;   // Display the count of new member registrations.
    // Render a table using textContent to avoid inserting raw HTML data.
    const renderTable = (containerId, columns, rows) => {
      const container = $(containerId);
      if (!container) return;

      container.replaceChildren();

      if (!rows.length) {
        container.textContent = "No report data available.";
        return;
      }

      const table = document.createElement("table");
      const thead = document.createElement("thead");
      const headerRow = document.createElement("tr");

      columns.forEach(column => {
        const th = document.createElement("th");
        th.textContent = column.label;
        headerRow.appendChild(th);
      });

      thead.appendChild(headerRow);
      table.appendChild(thead);

      const tbody = document.createElement("tbody");

      rows.forEach(row => {
        const tr = document.createElement("tr");

        columns.forEach(column => {
          const td = document.createElement("td");
          td.textContent = column.format
  ? column.format(row[column.key], row)
  : row[column.key] ?? "";
          tr.appendChild(td);
        });

        tbody.appendChild(tr);
      });

      table.appendChild(tbody);
      container.appendChild(table);
    };

    // Display payment totals by status and currency.
    renderTable(
      "reportPaymentsStatus",
      [
        { key: "currency", label: "Currency" },
        { key: "status", label: "Payment Status" },
        { key: "transaction_count", label: "Transactions" },
        {
          key: "total_amount",
          label: "Total Amount",
          format: value =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2
  }).format(Number(value))
        }
      ],
      data.payments_by_status || []
    );

    // Display paid payment totals by membership category.
    renderTable(
      "reportPaymentsCategory",
      [
        { key: "membership_category", label: "Membership Category" },
        { key: "currency", label: "Currency" },
        { key: "transaction_count", label: "Transactions" },
        {
          key: "total_amount",
          label: "Paid Amount",
          format: value =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2
  }).format(Number(value))
        }
      ],
      data.paid_payments_by_category || []
    );

    // Display member counts by membership category.
    renderTable(
      "reportMembersCategory",
      [
        { key: "membership_category", label: "Membership Category" },
        { key: "count", label: "Members" }
      ],
      data.members_by_category || []
    );

    // Display monthly paid revenue, separated by currency.
    renderTable(
      "reportMonthlyRevenue",
      [
        { key: "month", label: "Month" },
        { key: "currency", label: "Currency" },
        { key: "transaction_count", label: "Paid Transactions" },
        {
          key: "total_amount",
          label: "Revenue",
          format: (value, row) =>
            new Intl.NumberFormat("en-IN", {
              style: "currency",
              currency: row.currency || "INR",
              maximumFractionDigits: 2
            }).format(Number(value))
        }
      ],
      data.monthly_revenue || []
    );

    
    // Render a simple bar chart for monthly revenue.
    const chart = $("reportMonthlyRevenueChart");

    if (chart) {
      chart.replaceChildren();

      const revenueRows = data.monthly_revenue || [];

      if (revenueRows.length === 0) {
        chart.textContent = "No monthly revenue data available.";
      } else {
        // Keep currencies separate; each currency gets its own chart group.
        const currencies = [...new Set(
          revenueRows.map(row => row.currency || "Unknown")
        )];

        currencies.forEach(currency => {
          const heading = document.createElement("h4");
          heading.textContent = `Monthly Revenue (${currency})`;
          chart.appendChild(heading);

          const rows = revenueRows.filter(
            row => (row.currency || "Unknown") === currency
          );

          const maxAmount = Math.max(
            ...rows.map(row => Number(row.total_amount) || 0),
            1
          );

          rows.forEach(row => {
            const item = document.createElement("div");
            item.className = "report-revenue-item";

            const label = document.createElement("div");
            label.className = "report-revenue-label";
            label.textContent = row.month;

            const track = document.createElement("div");
            track.className = "report-revenue-track";

            const bar = document.createElement("div");
            bar.className = "report-revenue-bar";
            bar.style.width =
              `${Math.max(0, Number(row.total_amount) / maxAmount * 100)}%`;

            bar.setAttribute("role", "img");
            bar.setAttribute(
              "aria-label",
              `${row.month}: ${row.total_amount} ${currency}`
            );

            track.appendChild(bar);

            const amount = document.createElement("span");
            amount.className = "report-revenue-amount";
            amount.textContent =
              new Intl.NumberFormat("en-IN", {
                style: "currency",
                currency,
                maximumFractionDigits: 2
              }).format(Number(row.total_amount) || 0);

            const transactions = document.createElement("small");
            transactions.textContent =
              `${Number(row.transaction_count) || 0} paid transactions`;

            item.append(label, track, amount, transactions);
            chart.appendChild(item);
          });
        });

        
// Render monthly membership growth table.
renderTable(
  "reportMembershipGrowth",
  [
    { key: "month", label: "Month" },
    { key: "new_members", label: "New Members" }
  ],
  data.monthly_membership_growth || []
);

// Render monthly membership growth chart.
const membershipChart = $("reportMembershipGrowthChart");

if (membershipChart) {
  membershipChart.replaceChildren();

  const growthRows = data.monthly_membership_growth || [];

  if (growthRows.length === 0) {
    membershipChart.textContent = "No membership growth data available.";
  } else {
    const maxMembers = Math.max(
      ...growthRows.map(row => Number(row.new_members) || 0),
      1
    );

    growthRows.forEach(row => {
      const item = document.createElement("div");
      item.className = "report-revenue-item";

      const label = document.createElement("div");
      label.className = "report-revenue-label";
      label.textContent = row.month;

      const track = document.createElement("div");
      track.className = "report-revenue-track";

      const bar = document.createElement("div");
      bar.className = "report-revenue-bar";
      bar.style.width =
        `${Math.max(0, Number(row.new_members) / maxMembers * 100)}%`;

      track.appendChild(bar);

      const amount = document.createElement("span");
      amount.className = "report-revenue-amount";
      amount.textContent = `${Number(row.new_members) || 0} members`;

      item.append(label, track, amount);
      membershipChart.appendChild(item);
    });
  }
}
      }
    }


    if (message) message.textContent = "Reports loaded successfully.";

  } catch (error) {
    console.error("Failed to load admin reports:", error);

    if (message) {
      message.textContent = error.message || "Unable to load reports.";
    }
  }
}

// Show a specific page and update navigation state.

function showPage(id,button){
  document.querySelectorAll(".page").forEach(p=>p.classList.remove("active"));
  const page=$(id);
  if(page) page.classList.add("active");
  if($("title")) $("title").textContent=pageTitles[id]||"ICMTA Faculty Directory";
  document.querySelectorAll(".nav button").forEach(b=>b.classList.remove("active"));
  if(button) {
    button.classList.add("active");
  } else {
    const navBtn = document.querySelector(`.nav button[data-page="${id}"]`);
    if(navBtn) navBtn.classList.add("active");
  }
  if(id==="dashboard") updateDashboard();
  if(id==="directory") renderDirectory();
  if(id==="management") renderManagement();
  if(id==="users") renderUsers();
  if(id==="membership-applications" && typeof loadAdminApplications==="function") loadAdminApplications();
 if (id === "advertisements" && typeof loadAdvertisementsAdmin === "function") {
    loadAdvertisementsAdmin();
  }

  // Load report data whenever the Reports page is opened.
if (id === "reports" && typeof loadAdminReports === "function") {
  loadAdminReports();
}

}

document.addEventListener("click", event => {
  if (event.target.closest("#exportReportsCsv")) {
    exportAdminReportsCsv();
  }
});


/* Existing CSV export listener */
document.addEventListener("click", event => {
  if (event.target.closest("#exportReportsCsv")) {
    exportAdminReportsCsv();
  }
});

/* NEW: Apply and Clear date filter listeners */
document.addEventListener("click", event => {
  if (event.target.closest("#applyReportDateFilter")) {
    const startDate = document.getElementById("reportStartDate").value;
    const endDate = document.getElementById("reportEndDate").value;

    if (startDate && endDate && startDate > endDate) {
      alert("Start date cannot be later than end date.");
      return;
    }

    loadAdminReports();
  }

  if (event.target.closest("#clearReportDateFilter")) {
    document.getElementById("reportStartDate").value = "";
    document.getElementById("reportEndDate").value = "";
    loadAdminReports();
  }
});



// Generate the next available Member ID in the format ICMTA001, ICMTA002, etc.
function nextId(){
  let max=0;
  for(const m of members){
    const n=parseInt(String(m.id||"").replace("ICMTA",""),10);
    if(Number.isFinite(n)) max=Math.max(max,n);
  }
  return "ICMTA"+String(max+1).padStart(3,"0");
}
// Preview a selected photo file in the specified target element.
function previewPhoto(input,targetId){
  const file=input?.files?.[0];
  if(!file) return;
  const reader=new FileReader();
  reader.onload=()=>{
    photoData=reader.result;
    const target=$(targetId);
    if(target) target.innerHTML='<img src="'+reader.result+'" alt="Selected photo">';
  };
  reader.readAsDataURL(file);
}
// Read form data into an object, excluding the "photo" field.
function readForm(form){
  const data={};
  new FormData(form).forEach((v,k)=>{
    if(k!=="photo") data[k]=v;
  });
  return data;
}
// Check for uniqueness of Member ID, professional email, and mobile number.
function uniqueCheck(record,excludeId){
  const currentId=String(record.id||"").trim();
  const email=normalize(record.professionalEmail);
  const phone=String(record.mobile||"").replace(/\D/g,"");

  // Member IDs must be unique.
  if(currentId){
    const duplicateId=members.some(m=>
      String(m.id||"").trim().toUpperCase()===currentId.toUpperCase()
      && String(m.id||"")!==String(excludeId||"")
    );
    if(duplicateId){
      alert("This Member ID is already assigned to another member.");
      return false;
    }
  }

  // Professional email must be unique.
  if(email){
    const exists=members.some(m=>
      String(m.id||"")!==String(excludeId||"")
      && normalize(m.professionalEmail)===email
    );
    if(exists){
      alert("This professional email is already registered.");
      return false;
    }
  }

  // Mobile number must be unique.
  if(phone){
    const exists=members.some(m=>
      String(m.id||"")!==String(excludeId||"")
      && String(m.mobile||"").replace(/\D/g,"")===phone
    );
    if(exists){
      alert("This phone number is already registered.");
      return false;
    }
  }

  return true;
}

// Validate the format and uniqueness of a Member ID.
function validateMemberId(id,excludeId){
  const value=String(id||"").trim().toUpperCase();
// Check for the correct format: ICMTA followed by at least 3 digits.
  if(!/^ICMTA\d{3,}$/.test(value)){
    alert("Invalid Member ID. Use the format ICMTA001, ICMTA002, ICMTA003...");
    return false;
  }
// Check for duplicates in the existing members list.
  const duplicate=members.some(m=>
    String(m.id||"").trim().toUpperCase()===value
    && String(m.id||"")!==String(excludeId||"")
  );
// Alert the user if a duplicate is found.
  if(duplicate){
    alert("Member ID "+value+" already exists. Please use a unique ID.");
    return false;
  }

  return true;
}
// Build a member record from form data, merging with existing data if provided.
function buildRecord(form,existing){
  const data=readForm(form);
  const name=String(data.name||"").trim();
  return {
    ...(existing||{}),
    ...data,
    id:String(existing?.id||nextId()).trim().toUpperCase(),
    name:((data.title||"")+" "+name).trim(),
    photo: existing?.photo || ""
  };
}
// Reset the member entry form to its default state.
function resetEntryForm(){
  const form=$("adminForm");
  if(form) form.reset();
  photoData="";
  const preview=$("adminPhoto");
  if(preview) preview.innerHTML="Photo preview";
  const heading=$("addHeading");
  if(heading) heading.textContent="Manual Member Entry";
  const button=$("adminSaveBtn");
  if(button){
    button.textContent="Save Member & Generate ID";
    button.type="submit";
    button.onclick=null;
  }
  editingMemberId=null;
}
// Handle the submission of the admin member entry form, including validation and backend communication.
async function handleAdminSubmit(event){
  event.preventDefault();

  if(saving) return;
  saving = true;

  try{
    const form = event.currentTarget;
    const existingId = editingMemberId;
    const existing = existingId
      ? members.find(m => String(m.id) === String(existingId))
      : null;
    
    if(existingId && !existing){
      alert("Member record not found.");
      return;
    }
// Build the member record from form data, merging with existing data if applicable.
    const record = buildRecord(form, existing);

    if(!normalize(record.name)){
      alert("Please enter the member name.");
      return;
    }

    const photoInput = document.getElementById("adminPhotoInput");
    const photoFile = photoInput?.files?.[0] || null;

    /*
     * NEW MEMBER
     * Send the member data + actual photo file
     * to the backend.
     */
    if(!existingId){

      const token = localStorage.getItem("ICMTAdminToken");

      if(!token){
        throw new Error("Admin session expired. Please log in again.");
      }

      const formData = new FormData();

      formData.append("name", record.name);
      formData.append("qualification", record.qualification || "");
      formData.append("designation", record.designation || "");
      formData.append("department", record.department || "");
      formData.append("institution", record.college || "");
      formData.append("city", record.city || "");
      formData.append("state_province", record.state || "");
      formData.append("country", record.country || "");
      formData.append("expertise", record.expertise || "");
      formData.append("mobile", record.mobile || "");
      formData.append("professional_email", record.professionalEmail || "");
      formData.append("personal_email", record.personalEmail || "");
      formData.append("research_guideship", record.guideship || "");

      if(photoFile){
        formData.append("photo", photoFile);
      }

      const response = await fetch(
        `${API_BASE_URL}/api/admin/members`,
        {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${token}`
          },
          body: formData
        }
      );

      const result = await response.json();

      if(!response.ok || !result.success){
        throw new Error(result.error || "Could not save member.");
      }

      const saved = result.data;

      console.log("Member created in backend:", saved);
      console.log("Photo URL:", saved.photo_url);

      members = await loadMembersFromBackend();

      updateDashboard();
      renderDirectory();
      updateDataQuality();

      resetEntryForm();
      showPage("management");

      toast("Member saved successfully — " + saved.member_id);

      return;
    }

    /*
     * EXISTING MEMBER
     * Leave Edit handling alone for now.
     */
    alert("Photo/Create connection is ready for new members. Edit will be connected separately.");

  }catch(e){

    console.error("Member save failed:", e);
    alert(e.message || "The member details could not be saved.");

  }finally{

    setTimeout(() => saving = false, 250);

  }
}
// Populate the state and country filter dropdowns in the directory view.
function populateDirectoryGlobalFilters(){
  const stateSelect=$("filterState");
  const countrySelect=$("filterCountry");
  const currentState=stateSelect?.value||"";
  const currentCountry=countrySelect?.value||"";

  const states=[...new Set(
    members.map(m=>String(m.state||"").trim()).filter(Boolean)
  )].sort((a,b)=>a.localeCompare(b,undefined,{sensitivity:"base"}));

  const countries=[...new Set(
    members.map(m=>String(m.country||"").trim()).filter(Boolean)
  )].sort((a,b)=>a.localeCompare(b,undefined,{sensitivity:"base"}));

  if(stateSelect){
    stateSelect.innerHTML='<option value="">All States</option>'+
      states.map(s=>'<option value="'+esc(s)+'">'+esc(s)+'</option>').join("");
    if(states.includes(currentState)) stateSelect.value=currentState;
  }

  if(countrySelect){
    countrySelect.innerHTML='<option value="">All Countries</option>'+
      countries.map(c=>'<option value="'+esc(c)+'">'+esc(c)+'</option>').join("");
    if(countries.includes(currentCountry)) countrySelect.value=currentCountry;
  }
}
// Normalize the expertise field for consistent sorting and display.
function getNormalizedExpertise(exp){
  if(!exp) return "";
  let list=[];
  if(Array.isArray(exp)){
    list=exp.map(x=>String(x||"").trim()).filter(Boolean);
  }else if(typeof exp==="string"){
    list=exp.split(",").map(x=>x.trim()).filter(Boolean);
  }else{
    const s=String(exp).trim();
    if(s) list=[s];
  }
  if(!list.length) return "";
  list.sort((a,b)=>a.localeCompare(b,undefined,{sensitivity:"base"}));
  return list.join(", ");
}
// Render the faculty directory based on search, filters, and sorting options.
function renderDirectory(){
  // Alphabetical sorting:
  // 1. Remove titles such as Dr., Mr., Ms., Mrs., Prof., Lt. Dr.
  // 2. Find the FIRST actual alphabetic character.
  // 3. Sort by that starting letter.
  // 4. Within the same letter, sort by the complete normalized name.
  const normalizeNameForAZ = value => {
    let s=String(value||"").trim();

    const prefixes=[
      /^lt\.?\s*dr\.?\s+/i,
      /^dr\.?\s+/i,
      /^mr\.?\s+/i,
      /^mrs\.?\s+/i,
      /^ms\.?\s+/i,
      /^miss\s+/i,
      /^prof\.?\s+/i,
      /^professor\s+/i
    ];

    let changed=true;
    while(changed){
      changed=false;
      for(const prefix of prefixes){
        const next=s.replace(prefix,"").trim();
        if(next!==s){
          s=next;
          changed=true;
        }
      }
    }

    // Ignore periods and other punctuation completely for sorting.
    // Only the actual alphabetic characters determine the order.
    s=s.replace(/[.]/g,"").trim();

    const match=s.match(/[A-Za-z]/);
    const firstLetter=match ? match[0].toUpperCase() : "#";

    // Remove all non-alphabetic characters for the final comparison too.
    const fullName=s.replace(/[^A-Za-z0-9\s]/g,"")
                    .replace(/\s+/g," ")
                    .trim()
                    .toLocaleLowerCase();

    return {
      firstLetter,
      fullName
    };
  };

  const body=$("directoryBody");
  if(!body) return;

  populateDirectoryGlobalFilters();

  const q=normalize($("search")?.value);
  const state=$("filterState")?.value||"";
  const country=$("filterCountry")?.value||"";
  const designation=$("filterDes")?.value||"";
  const sort=$("sortBy")?.value||"name";

  // Search behavior:
  // If the user enters a single alphabetic letter (e.g. "K"),
  // show only members whose actual name starts with that letter.
  // Titles such as Dr., Mr., Ms., Mrs. and Prof. are ignored.
  const searchIsSingleLetter=/^[a-z]$/i.test(q);

  let list=members.filter(m=>{
    const searchable=[
      m.name,m.designation,m.department,m.college,m.city,m.state,m.country,m.expertise
    ].join(" ").toLowerCase();

    let searchMatch=true;

    if(q){
      if(searchIsSingleLetter){
        const normalized=normalizeNameForAZ(m.name);
        searchMatch=normalized.firstLetter===q.toUpperCase();
      }else{
        searchMatch=searchable.includes(q);
      }
    }

    return searchMatch
      && (!state||normalize(m.state)===normalize(state))
      && (!country||normalize(m.country)===normalize(country))
      && (!designation||normalize(m.designation)===normalize(designation));
  });

  list.sort((a,b)=>{
    if(sort==="name"){
      const A=normalizeNameForAZ(a.name);
      const B=normalizeNameForAZ(b.name);

      const letterCompare=A.firstLetter.localeCompare(B.firstLetter);
      if(letterCompare!==0) return letterCompare;

      return A.fullName.localeCompare(
        B.fullName,
        undefined,
        {numeric:true,sensitivity:"base"}
      );
    }

    if(sort==="id"){
      const ai=parseInt(String(a.id||"").replace(/\D/g,""),10);
      const bi=parseInt(String(b.id||"").replace(/\D/g,""),10);
      return (Number.isFinite(ai)?ai:Infinity)-(Number.isFinite(bi)?bi:Infinity);
    }

    if(sort==="designation"){
      return String(a.designation||"").localeCompare(
        String(b.designation||""),
        undefined,
        {sensitivity:"base"}
      );
    }

    if(sort==="state"){
      return String(a.state||"").localeCompare(
        String(b.state||""),
        undefined,
        {sensitivity:"base"}
      );
    }

    if(sort==="country"){
      return String(a.country||"").localeCompare(
        String(b.country||""),
        undefined,
        {sensitivity:"base"}
      );
    }

    if(sort==="expertise"){
      const expA=getNormalizedExpertise(a.expertise);
      const expB=getNormalizedExpertise(b.expertise);
      if(!expA&&!expB) return 0;
      if(!expA) return 1;
      if(!expB) return -1;
      return expA.localeCompare(
        expB,
        undefined,
        {sensitivity:"base"}
      );
    }

    return String(a.name||"").localeCompare(
      String(b.name||""),
      undefined,
      {sensitivity:"base"}
    );
  });

  if(!list.length){
    body.innerHTML="";
    $("empty")?.classList.remove("hidden");
    return;
  }

  $("empty")?.classList.add("hidden");

  body.innerHTML=list.map(m=>{
    const photo=m.photo
      ? '<img class="thumb" src="'+m.photo+'" alt="Member photo">'
      : '<span class="thumb-placeholder">No photo</span>';

    const memberId=esc(m.id);

    return '<tr>'
      +'<td class="cell-photo">'+photo+'</td>'
      +'<td class="cell-id"><b>'+memberId+'</b></td>'
      +'<td class="cell-member"><span class="avatar">'+esc(initials(m.name))+'</span><span>'+esc(m.name||"Not specified")+'</span></td>'
      +'<td class="cell-designation">'+esc(m.designation||"Not specified")+'</td>'
      +'<td class="cell-institution">'+esc(m.college||"Not specified")+'</td>'
      +'<td class="cell-city">'+esc(m.city||"Not specified")+'</td>'
      +'<td class="cell-state">'+esc(m.state||"Not specified")+'</td>'
      +'<td class="cell-action"><button class="btn secondary directory-view-btn" type="button" data-member-id="'+memberId+'" onclick="window.location.href=\'membership.html\'">View</button></td>'
      +'</tr>';
  }).join("");
}

function viewProfileById(button){
  viewProfile(button.getAttribute("data-id"));
}

function viewProfile(id){
  const member=members.find(m=>String(m.id)===String(id));
  if(!member){
    showToast("Member record not found.");
    return;
  }

  // PUBLIC PROFILE:
  // Deliberately expose only directory-approved information.
  // Contact details, private address information and other administrative
  // fields remain available only to authorized management users.
  const expertise=Array.isArray(member.expertise)
    ? member.expertise
    : String(member.expertise||"").split(",").map(x=>x.trim()).filter(Boolean);

  const photo=member.photo
    ? '<img src="'+member.photo+'" alt="Member photo">'
    : '<span>No photo</span>';

  $("profileContent").innerHTML=
    '<div class="profile">'
    +'<div><div class="photo-large">'+photo+'</div></div>'
    +'<div>'
    +'<div class="info-grid">'
    +'<div class="info"><b>Name</b>'+esc(member.name||"Not specified")+'</div>'
    +'<div class="info"><b>Designation</b>'+esc(member.designation||"Not specified")+'</div>'
    +'<div class="info"><b>Qualification</b>'+esc(member.qualification||"Not specified")+'</div>'
    +'<div class="info"><b>Department</b>'+esc(member.department||"Not specified")+'</div>'
    +'<div class="info"><b>Institution / Organization</b>'+esc(member.college||"Not specified")+'</div>'
    +'<div class="info"><b>City</b>'+esc(member.city||"Not specified")+'</div>'
    +'<div class="info"><b>State / Province</b>'+esc(member.state||"Not specified")+'</div>'
    +'<div class="info"><b>Country</b>'+esc(member.country||"Not specified")+'</div>'
    +'</div>'
    +(expertise.length
      ? '<div style="margin-top:12px"><div class="label" style="margin-bottom:7px">Expertise</div><div class="chips">'
        +expertise.map(x=>'<span class="chip">'+esc(x)+'</span>').join("")
        +'</div></div>'
      : '')
    +'</div></div>'
    +'<div class="notice" style="margin-top:18px">Public profile view. Administrative contact and private member information is restricted.</div>';

  showPage("profile");
}
// Generate HTML chips for a comma-separated list of values.
function chips(value){
  return String(value||"").split(",").map(x=>x.trim()).filter(Boolean)
    .map(x=>'<span class="chip">'+esc(x)+'</span>').join("");
}

// Open a dashboard metric panel showing members matching a specific category.
function openDashboardMetric(type){
  let list=[];
  let title="";
  let subtitle="";

  if(type==="total"){
    list=[...members];
    title="All Members";
    subtitle=list.length+" member record"+(list.length===1?"":"s");
  }else if(type==="pending"){
    list=members.filter(m=>String(m.status||"").toLowerCase()==="pending"||m.isPending);
    title="Pending Members";
    subtitle=list.length+" pending registration"+(list.length===1?"":"s")+" found";
  }else if(type==="missing-photos"){
    list=members.filter(m=>!String(m.photo||"").trim());
    title="Members with Missing Photos";
    subtitle=list.length+" member"+(list.length===1?"":"s")+" without photograph";
  }else if(type==="incomplete"){
    list=members.filter(m=>{
      const required=[
        m.name,m.qualification,m.designation,m.department,
        m.college,m.state,m.country,m.expertise
      ];
      return !required.every(v=>String(v??"").trim()!=="");
    });
    title="Incomplete Member Profiles";
    subtitle=list.length+" member profile"+(list.length===1?"":"s")+" with missing information";
  }else if(type==="scholars"){
    list=members.filter(m=>normalize(m.designation)==="research scholar");
    title="Research Scholars";
    subtitle=list.length+" research scholar"+(list.length===1?"":"s")+" found";
  }else if(type==="ap"){
    list=members.filter(m=>normalize(m.state)==="andhra pradesh");
    title="Members from Andhra Pradesh";
    subtitle=list.length+" member"+(list.length===1?"":"s")+" found";
  }else if(type==="countries"){
    const countries=[...new Set(members.map(m=>String(m.country||"").trim()).filter(Boolean))];
    list=members.filter(m=>countries.includes(String(m.country||"").trim()));
    title="Members by Country";
    subtitle=countries.length+" countr"+(countries.length===1?"y":"ies")+" represented";
  }else{
    return;
  }

  const panel=$("dashboardMetricResults");
  const body=$("dashboardMetricBody");
  if(!panel||!body) return;

  $("dashboardMetricTitle").textContent=title;
  $("dashboardMetricSubtitle").textContent=subtitle;

  body.innerHTML=list.length
    ? list.map(m=>{
        const photo=m.photo
          ? '<img class="thumb" src="'+m.photo+'" alt="Member photo">'
          : '<span class="thumb-placeholder">No photo</span>';
        return '<tr>'
          +'<td class="cell-photo">'+photo+'</td>'
          +'<td><b>'+esc(m.id||"Not specified")+'</b></td>'
          +'<td><div class="management-name">'+esc(m.name||"Not specified")+'</div></td>'
          +'<td>'+esc(m.designation||"Not specified")+'</td>'
          +'<td>'+esc(m.department||"Not specified")+'</td>'
          +'<td>'+esc(m.college||"Not specified")+'</td>'
          +'<td>'+esc(m.state||"Not specified")+'</td>'
          +'<td><button class="btn secondary" type="button" onclick="viewProfile(\''+esc(m.id)+'\')">View</button></td>'
          +'</tr>';
      }).join("")
    : '<tr><td colspan="8" style="text-align:center;padding:25px">No matching members found.</td></tr>';

  panel.style.display="block";
  panel.scrollIntoView({behavior:"smooth",block:"start"});
}
// Close the dashboard metric panel.
function closeDashboardMetric(){
  const panel=$("dashboardMetricResults");
  if(panel) panel.style.display="none";
}
// Update the dashboard metrics based on the current members data.
function updateDashboard(){
  const total=members.length;
  const pending=members.filter(m=>String(m.status||"").toLowerCase()==="pending"||m.isPending).length;
  const missingPhotos=members.filter(m=>!String(m.photo||"").trim()).length;
  const incomplete=members.filter(m=>{
    const required=[
      m.name,m.qualification,m.designation,m.department,
      m.college,m.state,m.country,m.expertise
    ];
    return !required.every(v=>String(v??"").trim()!=="");
  }).length;

  const scholars=members.filter(m=>normalize(m.designation)==="research scholar").length;
  const ap=members.filter(m=>normalize(m.state)==="andhra pradesh").length;
  const countries=new Set(members.map(m=>String(m.country||"").trim()).filter(Boolean)).size;

  if($("metricTotal")) $("metricTotal").textContent=total;
  if($("metricPending")) $("metricPending").textContent=pending;
  if($("metricMissingPhotos")) $("metricMissingPhotos").textContent=missingPhotos;
  if($("metricIncomplete")) $("metricIncomplete").textContent=incomplete;

  if (typeof updateAdminApplicationCounters === "function") updateAdminApplicationCounters();

  if($("metricScholars")) $("metricScholars").textContent=scholars;
  if($("metricAP")) $("metricAP").textContent=ap;
  if($("metricCountries")) $("metricCountries").textContent=countries;

  renderStats("stateStats",countBy("state"),showAllStateStats ? 0 : 5);
  renderStats("designationStats",countBy("designation"),showAllDesStats ? 0 : 5);
  renderCommaStats("expertiseStats",countMulti("expertise"),showAllExpertise ? 0 : 5);
  renderCommaStats("guideshipStats",countMulti("guideship"),showAllGuideship ? 0 : 5);
}

let showAllStateStats = false;
let showAllDesStats = false;
let showAllExpertise = false;
let showAllGuideship = false;
// Toggle the visibility of state statistics between top 5 and all states.
function toggleStateStatsView(){
  showAllStateStats = !showAllStateStats;
  const btn = $("stateStatsToggleBtn");
  const sub = $("stateStatsSubtitle");
  if(btn) btn.textContent = showAllStateStats ? "Show Less" : "View All";
  if(sub) sub.textContent = showAllStateStats ? "(All States)" : "(Top 5)";
  renderStats("stateStats", countBy("state"), showAllStateStats ? 0 : 5);
}
// Toggle the visibility of designation statistics between top 5 and all designations.
function toggleDesStatsView(){
  showAllDesStats = !showAllDesStats;
  const btn = $("desStatsToggleBtn");
  const sub = $("desStatsSubtitle");
  if(btn) btn.textContent = showAllDesStats ? "Show Less" : "View All";
  if(sub) sub.textContent = showAllDesStats ? "(All Designations)" : "(Top 5)";
  renderStats("designationStats", countBy("designation"), showAllDesStats ? 0 : 5);
}
// Toggle the visibility of expertise statistics between top 5 and all expertise areas.
function toggleExpertiseView(){
  showAllExpertise = !showAllExpertise;
  const btn = $("expertiseToggleBtn");
  const sub = $("expertiseSubtitle");
  if(btn) btn.textContent = showAllExpertise ? "Show Less" : "View All";
  if(sub) sub.textContent = showAllExpertise ? "(All)" : "(Top 5)";
  renderCommaStats("expertiseStats", countMulti("expertise"), showAllExpertise ? 0 : 5);
}
// Toggle the visibility of guideship statistics between top 5 and all guideships.
function toggleGuideshipView(){
  showAllGuideship = !showAllGuideship;
  const btn = $("guideshipToggleBtn");
  const sub = $("guideshipSubtitle");
  if(btn) btn.textContent = showAllGuideship ? "Show Less" : "View All";
  if(sub) sub.textContent = showAllGuideship ? "(All)" : "(Top 5)";
  renderCommaStats("guideshipStats", countMulti("guideship"), showAllGuideship ? 0 : 5);
}
// Count the occurrences of values for a specific field across all members.
function countBy(field){
  const counts={};
  if(field==="designation"){
    const categories=["Assistant Professor","Associate Professor","Professor","Dean","Research Scholar","Head of the Department","Principal","Director"];
    categories.forEach(c=>counts[c]=0);
    let matched=0;
    members.forEach(m=>{
      const v=normalize(m.designation);
      let c=null;
      if(v==="assistant professor") c="Assistant Professor";
      else if(v==="associate professor") c="Associate Professor";
      else if(v==="professor") c="Professor";
      else if(v==="dean") c="Dean";
      else if(v==="research scholar") c="Research Scholar";
      else if(v==="head of the department"||v==="head of department"||v==="hod"||v==="head of the department (hod)") c="Head of the Department";
      else if(v==="principal") c="Principal";
      else if(v==="director") c="Director";
      if(c){counts[c]++;matched++;}
    });
    counts["Not specified"]=members.length-matched;
    return counts;
  }
  members.forEach(m=>{
    const key=String(m[field]||"Not specified").trim()||"Not specified";
    counts[key]=(counts[key]||0)+1;
  });
  return counts;
}
//  
function countMulti(field){
  const counts={};
  members.forEach(m=>{
    const values=String(m[field]||"").split(",").map(x=>x.trim()).filter(Boolean);
    if(!values.length){
      counts["Not specified"]=(counts["Not specified"]||0)+1;
      return;
    }
    values.forEach(value=>{
      counts[value]=(counts[value]||0)+1;
    });
  });
  return counts;
}
// Render a bar chart for statistics based on counts, with an optional limit on the number of entries displayed.
function renderStats(id,counts,limit=5){
  const el=$(id);
  if(!el) return;
  let entries=Object.entries(counts).sort((a,b)=>b[1]-a[1]);
  if(!entries.length){
    el.innerHTML='<div class="empty" style="padding:12px;font-size:12px">No member records yet.</div>';
    return;
  }
  const max=Math.max(...entries.map(x=>x[1]),1);
  if(limit > 0){
    entries = entries.slice(0, limit);
  }
  el.innerHTML=entries.map(([k,v])=>{
    const width=Math.max(8,Math.round(v/max*100));
    return '<div style="font-size:12px;margin-bottom:2px;display:flex;justify-content:space-between;color:var(--text)"><span>'+esc(k)+'</span><b>'+v+'</b></div><div class="bar" style="height:6px;margin:3px 0 9px"><span style="width:'+width+'%"></span></div>';
  }).join("");
}
// Render a list of chips for statistics based on counts, with an optional limit on the number of entries displayed.
function renderCommaStats(id,counts,limit=5){
  const el=$(id);
  if(!el) return;
  let entries=Object.entries(counts).sort((a,b)=>b[1]-a[1]);
  if(!entries.length){
    el.innerHTML='<div class="empty" style="padding:8px;font-size:12px">No records available.</div>';
    return;
  }
  if(limit > 0){
    entries = entries.slice(0, limit);
  }
  el.innerHTML='<div class="chips" style="gap:5px">'+entries.map(([k,v])=>
    '<span class="chip" style="font-size:11px;padding:3px 8px">'+esc(k)+' <b>· '+v+'</b></span>'
  ).join("")+'</div>';
}
// Render the list of users in the admin management view, including their roles, status, and access controls.
function renderUsers(){
  const body=$("userBody");
  if(!body) return;
  body.innerHTML=users.map((u,i)=>
    '<tr><td>'+esc(u.name)+'</td><td>'+esc(u.role)+'</td>'
    +'<td><span class="badge '+(u.status==="Active"?"green":"red")+'">'+esc(u.status)+'</span></td>'
    +'<td><button class="btn '+(u.access==="Included"?"success":"danger")+'" type="button" onclick="toggleAccess('+i+')">'+esc(u.access)+'</button></td>'
    +'<td><button class="btn secondary" type="button" onclick="toggleStatus('+i+')">Toggle Status</button></td></tr>'
  ).join("");
}
// Toggle the access status of a user between "Included" and "Excluded", then persist the change and re-render the user list.
function toggleAccess(index){
  users[index].access=users[index].access==="Included"?"Excluded":"Included";
  persist();
  renderUsers();
}
// Toggle the active/inactive status of a user, then persist the change and re-render the user list.
function toggleStatus(index){
  users[index].status=users[index].status==="Active"?"Inactive":"Active";
  persist();
  renderUsers();
}
// Reset the entry mode for adding or editing a member, clearing any existing data and resetting the form.
function resetEntryMode(){
  editingMemberId=null;
  photoData="";
  const form=$("adminForm");
  if(form) form.reset();
}

document.addEventListener("click",function(event){
  const button=event.target.closest(".directory-view-btn");
  if(!button) return;
  window.location.href="membership.html";
});
// Handle the submission of the public registration form, including validation and saving the new member record.
function handlePublicSubmit(event){
  event.preventDefault();
  if(saving) return;
  saving=true;

  try{
    const form=event.currentTarget;
    const record=buildRecord(form,null);

    if(!normalize(record.name)){
      alert("Please enter the member name.");
      return;
    }

    if(!uniqueCheck(record,null)) return;

    members.push(record);
    persist();
    members=loadMembers();

    const saved=members.find(m=>String(m.id)===String(record.id));
    if(!saved) throw new Error("Could not verify saved record.");

    form.reset();
    photoData="";

    const preview=$("publicPhoto");
    if(preview) preview.innerHTML="Photo preview";

    updateDashboard();
    renderDirectory();

    alert("Registration submitted successfully.\nUnique Member ID: "+saved.id);
    backLogin();

  }catch(e){
    console.error(e);
    alert("The registration could not be saved.");

  }finally{
    setTimeout(()=>saving=false,250);
  }
}
document.addEventListener("DOMContentLoaded",()=>{
  const publicForm=$("publicForm");
  if(publicForm) publicForm.addEventListener("submit",handlePublicSubmit);

  const adminForm=$("adminForm");
  if(adminForm) adminForm.addEventListener("submit",handleAdminSubmit);

  $("loginBtn")?.addEventListener("click",login);
  $("openPublicBtn")?.addEventListener("click",openPublic);
  $("backLoginBtn")?.addEventListener("click",backLogin);
  $("logoutBtn")?.addEventListener("click",logout);

  $("publicPhotoInput")?.addEventListener("change",e=>previewPhoto(e.target,"publicPhoto"));
  $("adminPhotoInput")?.addEventListener("change",e=>previewPhoto(e.target,"adminPhoto"));

  $("search")?.addEventListener("input",renderDirectory);
  $("filterState")?.addEventListener("change",renderDirectory);
  $("filterDes")?.addEventListener("change",renderDirectory);
  $("sortBy")?.addEventListener("change",renderDirectory);

  removeAdminSidebarButtons();
  document.querySelectorAll(".nav button").forEach(button=>{
    button.addEventListener("click",()=>showPage(button.dataset.page,button));
  });

  updateDashboard();
  renderUsers();
});

if(typeof document!=="undefined" && document.readyState!=="loading"){
  removeAdminSidebarButtons();
}

document.addEventListener("DOMContentLoaded", function(){
  removeAdminSidebarButtons();
  try{
    const saved=localStorage.getItem("ICMTAPrototypeRole");
    if(["public","member","admin"].includes(saved)){
      prototypeRole=saved;
      const select=$("prototypeRole");
      if(select) select.value=saved;
    }
  }catch(e){}
  applyRoleAccess();
});

/* ==========================================================================
   ICMTA — GLOBAL WEBSITE SEARCH
   ========================================================================== */
(function () {
  'use strict';

  var WEBSITE_PAGES = [
    {
      title: 'Home — Indian Commerce and Management Teachers Association',
      section: 'Connecting Commerce and Management Teachers across India',
      url: 'index.html',
      content: 'An independent, non-profit professional platform established by senior academicians. Supporting research, doctoral supervision and faculty development from the first year of teaching to the last. Built by academicians, for academicians. Connecting commerce and management teachers across India. 343 faculty listed, 310 institutions, 26 states and UTs.'
    },
    {
      title: 'Home — Spotlight & Current Events',
      section: 'Spotlight: National Seminar & Webinar Announcements',
      url: 'index.html#events',
      content: 'Call for Papers National Seminar Vijayawada Siddhartha Academy Bhagavad Gita ethical leadership management sustainable development Viksit Bharat 2047. Webinar: The Art of Voice Modulation speak to inspire Dr Prashanth S Principal Bengaluru. Panel Discussion: Performative Wokeism.'
    },
    {
      title: 'About Us — Overview',
      section: 'About ICMTA',
      url: 'pages/about-us.html',
      content: 'Indian Commerce and Management Teachers Association is an independent, non-profit academic body founded by senior professors and academicians to foster collaboration, research excellence, and professional growth in commerce and management education across India.'
    },
    {
      title: 'About Us — Vision & Mission',
      section: 'Vision and Mission Statements',
      url: 'pages/about-us.html#vision-mission',
      content: 'Our vision is to empower commerce and management educators, foster impactful research, elevate teaching standards, and build a unified national academic community dedicated to excellence, innovation, and ethical leadership.'
    },
    {
      title: 'About Us — Founders & Mentors',
      section: 'Founders, Mentors & Advisory Board',
      url: 'pages/about-us.html#founders',
      content: 'ICMTA was established and mentored by esteemed professors, deans, and educational leaders from premier universities and institutions across India who guide our academic mission, research initiatives, and governance.'
    },
    {
      title: 'About Us — Code of Conduct',
      section: 'Professional Code of Conduct',
      url: 'pages/about-us.html#code-of-conduct',
      content: 'Guiding principles of integrity, academic honesty, professional respect, inclusivity, and ethical research standards expected from all ICMTA members, fellows, and participating scholars.'
    },
    {
      title: 'Our Initiatives — Overview',
      section: 'Academic & Faculty Development Initiatives',
      url: 'pages/initiatives.html',
      content: 'ICMTA conducts specialized faculty development programmes, research workshops, public speaking networks, doctoral mentorship symposiums, and national academic conclaves.'
    },
    {
      title: 'Our Initiatives — Global Public Speaking Network',
      section: 'Global Public Speaking Network (GPSN)',
      url: 'pages/initiatives.html',
      content: 'Empowering teachers and research scholars with voice modulation, rhetorical clarity, confidence, and international academic presentation skills.'
    },
    {
      title: 'Events — Upcoming Events 2026',
      section: 'Upcoming Conclaves, Seminars & Workshops',
      url: 'pages/events.html#upcoming',
      content: 'Upcoming academic events, conferences, national seminars, call for papers, and interactive webinars organized by ICMTA and partner universities. Check dates, speaker profiles, registration links, and deadlines.'
    },
    {
      title: 'Events — National Seminar (Vijayawada)',
      section: 'National Seminar on Bhagavad Gita & Ethical Leadership',
      url: 'pages/events.html#upcoming',
      content: 'Organized in collaboration with Siddhartha Academy, Vijayawada, Andhra Pradesh. Exploring ethical leadership, management principles, sustainable development, and Viksit Bharat 2047. Call for research papers and abstract submissions.'
    },
    {
      title: 'Events — Voice Modulation Webinar',
      section: 'Webinar: The Art of Voice Modulation',
      url: 'pages/events.html#upcoming',
      content: 'Speak to Inspire with Dr. Prashanth S, Principal and Radio Jockey at Rainbow FM Bengaluru. Master vocal dynamics, clarity, engagement, and effective classroom delivery for educators.'
    },
    {
      title: 'Events — Performative Wokeism Panel Discussion',
      section: 'Panel Discussion on Performative Wokeism',
      url: 'pages/events.html#upcoming',
      content: 'Critical examination of social media discourse, brand ethics, and academic perspectives on performative wokeism, organized with Ashoka Institute, Varanasi.'
    },
    {
      title: 'Events — Past Conclaves & Archives',
      section: 'Past Conclaves & Archive Records',
      url: 'pages/events.html#past',
      content: 'Archived proceedings, recordings, summaries, and delegate outcomes from past ICMTA national conferences, faculty development programs, and academic seminars.'
    },
    {
      title: 'Membership — Overview & Benefits',
      section: 'Why Join ICMTA',
      url: 'pages/membership.html#why',
      content: 'Discover the advantages of joining ICMTA: national academic networking, research collaboration, publication opportunities, conference fee discounts, faculty recognition, and access to doctoral mentors.'
    },
    {
      title: 'Membership — Categories & Fee Structure',
      section: 'Membership Categories & Annual Fees',
      url: 'pages/membership.html#categories',
      content: 'Detailed fee structure for Life Membership, Annual Membership, Associate Membership, and Student / Research Scholar Membership for commerce and management faculty.'
    },
    {
      title: 'Membership — Application Process',
      section: 'How to Apply for Membership',
      url: 'pages/membership.html#apply-section',
      content: 'Step-by-step instructions for submitting your membership application online, uploading credentials, completing payment verification, and receiving your ICMTA membership certificate.'
    },
    {
      title: 'Scholars Corner — Public Directory',
      section: 'Member Directory & Faculty Roster',
      url: 'pages/public-directory.html',
      content: 'Explore profiles of commerce and management professors, assistant professors, associate professors, deans, and research scholars across India. Filter by state, specialization, and institution in the Directory.'
    },
    {
      title: 'Members Corner',
      section: 'Member Portal & Exclusive Services',
      url: 'pages/members.html',
      content: 'Dedicated corner for registered ICMTA members. Access member-only updates, update profile information, access academic resources, and view membership credentials.'
    },
    {
      title: 'ICMTA Resources',
      section: 'Academic Resources, Downloads & Forms',
      url: 'pages/resources.html',
      content: 'Downloadable academic guidelines, curriculum frameworks, research methodology notes, membership forms, association constitution, and teaching aids for faculty members.'
    },
    {
      title: 'ICMT Resources',
      section: 'Commerce & Management Teaching Materials',
      url: 'pages/icmt-resources.html',
      content: 'Reference materials, case studies, academic articles, reading lists, and teaching methodologies curated for commerce and business management faculty.'
    },
    {
      title: 'Contact Us',
      section: 'Reach the ICMTA Secretariat',
      url: 'pages/contact.html',
      content: 'Get in touch with ICMTA for membership queries, event collaboration, research proposals, or administrative support. Email: support@icmta.in, contact phone, and official office address.'
    },
    {
      title: 'Contact Information',
      section: 'Secretariat Address & Office Locations',
      url: 'pages/contact-us.html',
      content: 'Official secretariat office location, administrative phone numbers, communication desk, and support emails for institutional partners.'
    },
    {
      title: 'Faculty Listing',
      section: 'Faculty Members by Department & University',
      url: 'pages/faculty.html',
      content: 'Faculty database listing professors, associate professors, and lecturers representing universities, colleges, and business schools nationwide.'
    },
    {
      title: 'Membership Payment',
      section: 'Online Membership Fee Payment',
      url: 'pages/payment.html',
      content: 'Secure fee payment portal for new membership registrations and annual renewals via UPI, Net Banking, NEFT, IMPS, and card payment gateways.'
    }
  ];
  // Utility function to escape special characters in a string for use in a regular expression.
  function escapeRegExp(str) {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }
// Highlight occurrences of search terms in the provided text by wrapping them in a styled <mark> element.
  function highlightMatches(text, words) {
    if (!text) return '';
    var safeText = text;
    words.forEach(function (w) {
      if (!w) return;
      var re = new RegExp('(' + escapeRegExp(w) + ')', 'gi');
      safeText = safeText.replace(re, '<mark style="background:#fef08a;color:#854d0e;padding:1px 3px;border-radius:2px;font-weight:600;">$1</mark>');
    });
    return safeText;
  }
// Create a snippet of the content around the first occurrence of any search term, highlighting the matched words.
  function createSnippet(content, words, maxLen) {
    maxLen = maxLen || 140;
    var lower = content.toLowerCase();
    var firstIdx = content.length;
    words.forEach(function (w) {
      var i = lower.indexOf(w.toLowerCase());
      if (i !== -1 && i < firstIdx) firstIdx = i;
    });

    var start = Math.max(0, firstIdx - 35);
    var end = Math.min(content.length, start + maxLen);
    var snippet = (start > 0 ? '&hellip; ' : '') + content.substring(start, end) + (end < content.length ? ' &hellip;' : '');
    return highlightMatches(snippet, words);
  }
// Score a page based on the presence and frequency of search terms in its title, section, and content.
  function scorePage(page, words) {
    var haystack = (page.title + ' ' + page.section + ' ' + page.content).toLowerCase();
    var score = 0;
    var allMatched = true;

    words.forEach(function (w) {
      var lowerW = w.toLowerCase();
      var re = new RegExp(escapeRegExp(lowerW), 'g');
      var matches = haystack.match(re);
      if (matches && matches.length > 0) {
        score += matches.length;
        if (page.title.toLowerCase().indexOf(lowerW) !== -1) score += 6;
        if (page.section.toLowerCase().indexOf(lowerW) !== -1) score += 4;
      } else {
        allMatched = false;
      }
    });

    if (allMatched) score += 5;
    return score;
  }

  function performSearch(query) {
    var raw = query.trim().replace(/\s+/g, ' ');
    var words = raw.split(' ').filter(function (w) { return w.length > 1; });
    if (!words.length) return [];

    var scored = [];
    WEBSITE_PAGES.forEach(function (p) {
      var s = scorePage(p, words);
      if (s > 0) {
        scored.push({ page: p, score: s });
      }
    });

    scored.sort(function (a, b) { return b.score - a.score; });
    return scored.map(function (item) { return item.page; });
  }

  function resolvePageUrl(targetUrl) {
    if (!targetUrl) return '';
    var path = (typeof window !== 'undefined' && window.location && window.location.pathname) ? window.location.pathname.replace(/\\/g, '/') : '';
    var href = (typeof window !== 'undefined' && window.location && window.location.href) ? window.location.href.replace(/\\/g, '/') : '';
    var isInPagesDir = /\/pages\//i.test(path) || /\/pages\//i.test(href);

    if (isInPagesDir) {
      if (targetUrl.indexOf('pages/') === 0) {
        return targetUrl.substring(6);
      }
      if (targetUrl.indexOf('../') === 0 || targetUrl.indexOf('/') === 0) {
        return targetUrl;
      }
      return '../' + targetUrl;
    } else {
      return targetUrl;
    }
  }

  function initHeaderSearch() {
    var form = document.getElementById('headerSearchForm');
    var input = document.getElementById('headerSearchInput');
    var resultsBox = document.getElementById('headerSearchResults');
    if (!form || !input || !resultsBox) return;

    function renderResults(results, query) {
      var words = query.trim().split(/\s+/).filter(function (w) { return w.length > 1; });
      resultsBox.style.display = 'block';

      if (!results || results.length === 0) {
        resultsBox.innerHTML =
          '<div style="padding:18px 16px;text-align:center;color:#475569;">' +
            '<div style="font-weight:700;font-size:14px;color:#1e293b;margin-bottom:4px;">No results found</div>' +
            '<div style="font-size:12.5px;">No website pages matched &ldquo;' + highlightMatches(query, [query]) + '&rdquo;. Try another term.</div>' +
          '</div>';
        return;
      }

      var html = '<div style="padding:8px 14px;background:#f8fafc;border-bottom:1px solid #e2e8f0;display:flex;justify-content:space-between;align-items:center;">' +
                   '<span style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:#64748b;">' + results.length + ' website result' + (results.length > 1 ? 's' : '') + '</span>' +
                   '<button type="button" id="closeSearchPanel" style="background:none;border:none;cursor:pointer;color:#94a3b8;font-size:14px;line-height:1;padding:2px 6px;">&times;</button>' +
                 '</div>' +
                 '<div style="max-height:410px;overflow-y:auto;">';

      results.forEach(function (p) {
        var resolvedUrl = resolvePageUrl(p.url);
        html +=
          '<a href="' + resolvedUrl + '" style="display:block;padding:12px 14px;border-bottom:1px solid #f1f5f9;text-decoration:none;color:inherit;transition:background 0.15s;" ' +
          'onmouseover="this.style.backgroundColor=\'#f8fafc\'" onmouseout="this.style.backgroundColor=\'transparent\'">' +
            '<div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:3px;">' +
              '<span style="font-size:13.5px;font-weight:700;color:#00566b;">' + highlightMatches(p.section, words) + '</span>' +
              '<span style="font-size:11.5px;font-weight:600;color:#c49b4b;margin-left:8px;white-space:nowrap;">Open &rarr;</span>' +
            '</div>' +
            '<div style="font-size:11px;font-weight:600;color:#64748b;margin-bottom:4px;">' + p.title + '</div>' +
            '<div style="font-size:12.5px;color:#475569;line-height:1.5;">' + createSnippet(p.content, words) + '</div>' +
          '</a>';
      });

      html += '</div>';
      resultsBox.innerHTML = html;

      var closeBtn = document.getElementById('closeSearchPanel');
      if (closeBtn) {
        closeBtn.addEventListener('click', function (e) {
          e.preventDefault();
          e.stopPropagation();
          resultsBox.style.display = 'none';
        });
      }

      var links = resultsBox.querySelectorAll('a');
      for (var i = 0; i < links.length; i++) {
        links[i].addEventListener('click', function () {
          resultsBox.style.display = 'none';
        });
      }
    }

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var q = input.value.trim();
      if (!q) {
        resultsBox.style.display = 'none';
        return;
      }
      var matches = performSearch(q);
      renderResults(matches, q);
    });

    var debounceTimer;
    input.addEventListener('input', function () {
      clearTimeout(debounceTimer);
      var q = input.value.trim();
      if (q.length < 2) {
        resultsBox.style.display = 'none';
        return;
      }
      debounceTimer = setTimeout(function () {
        var matches = performSearch(q);
        renderResults(matches, q);
      }, 160);
    });

    document.addEventListener('click', function (e) {
      if (!form.contains(e.target) && !resultsBox.contains(e.target)) {
        resultsBox.style.display = 'none';
      }
    });

    input.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') {
        resultsBox.style.display = 'none';
      }
    });
  }

  if (typeof window !== 'undefined') {
    window.WEBSITE_PAGES = WEBSITE_PAGES;
    window.performSearch = performSearch;
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initHeaderSearch);
  } else {
    initHeaderSearch();
  }
})();


const AD_API_BASE = "http://localhost:5000/api";

async function advertisementRequest(path, options = {}) {
    const token = localStorage.getItem("ICMTAdminToken");

    const response = await fetch(`${AD_API_BASE}${path}`, {
        ...options,
        headers: {
            ...(options.headers || {}),
            Authorization: `Bearer ${token}`
        }
    });

    const result = await response.json().catch(() => ({}));

    if (!response.ok) {
        throw new Error(result.detail || result.message || "Advertisement request failed.");
    }

    return result;
}
// Load and display advertisements in the admin panel, handling loading state, errors, and rendering the advertisement list.

async function loadAdvertisementsAdmin() {
    const tbody = document.getElementById("advertisementsTableBody");
    if (!tbody) return;

    tbody.innerHTML = `<tr><td colspan="6">Loading advertisements...</td></tr>`;

    try {
        const result = await advertisementRequest("/admin/advertisements");
        const advertisements = result.data || [];

        if (!advertisements.length) {
            tbody.innerHTML = `<tr><td colspan="6">No advertisements found.</td></tr>`;
            return;
        }

        tbody.innerHTML = advertisements.map(ad => {
            const id = Number(ad.advertisement_id);
            const active = ad.is_active === true || ad.is_active === 1;
            const image = ad.image_url
                ? `http://localhost:5000${ad.image_url}`
                : "";

            return `
                <tr>
                    <td>${id}</td>
                    <td>${image ? `<img src="${image}" alt="Banner" style="width:100px;max-height:55px;object-fit:contain">` : "No image"}</td>
                    <td>${escapeAdvertisementText(ad.title)}</td>
                    <td>${escapeAdvertisementText(ad.placement)}</td>
                    <td>${active ? "Active" : "Inactive"}</td>
                    <td>
                        <button type="button" onclick="editAdvertisement(${id})">Edit</button>
                        <button type="button" onclick="toggleAdvertisement(${id}, ${!active})">${active ? "Deactivate" : "Activate"}</button>
                        <button type="button" onclick="deleteAdvertisement(${id})">Delete</button>
                    </td>
                </tr>
            `;
        }).join("");
    } catch (error) {
        console.error("Failed to load advertisements:", error);
        tbody.innerHTML = `<tr><td colspan="6">Failed to load advertisements: ${escapeAdvertisementText(error.message)}</td></tr>`;
    }
}

function escapeAdvertisementText(value) {
    return String(value ?? "").replace(/[&<>"']/g, char => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;"
    })[char]);
}


