// 子函数 1：请求 /cs/check 原始数据
// 返回：checkJson.data（可能为 null）
async function fetchCheckData(authToken) {
	const url = apiUrl("/cs/check");
	const headers = new Headers({
		"X-Auth-Token": authToken
	});
	console.log("[GET] 获取参会信息:", url);

	const res = await fetch(url, {
		method: "GET",
		headers
	});
	console.log("[/cs/check] status:", res.status);
	if (!res.ok) throw new Error("校验接口失败: " + res.status);

	const json = await res.json();
	console.log("[/cs/check] response:", json);
	if (json.code !== 0) throw new Error(json.message || "校验接口返回异常");
	return json.data ?? null;
}

// 子函数 2：单条访客映射为本地结构 ——
function mapVisitorRow(v) {
	return {
		name: v.receptionistName,
		gender: v.sex === 1 ? "男" : "女",
		mobile: v.phoneNo,
		company: v.company,
		title: v.position,
		hotelDate: v.hotelDate,
		hotelPlan: v.hotelPlan,
		needHotel: v.needHotel === "yes",
	};
}

// 子函数 3：解析 visitInfoDataList → { attendeesJN, attendeesSH, checkinJN, checkinSH } ——
function parseVisitorList(data) {
	const result = {
		attendeesJN: [],
		attendeesSH: [],
		checkinJN: 0,
		checkinSH: 0
	};
	if (!data) {
		console.log("[/cs/check] data 为 null，表示从未登记过");
		return result;
	}

	const list = Array.isArray(data.visitorInfoDataList) ? data.visitorInfoDataList : [];
	if (!list.length) {
		console.warn("[/cs/check] visitorInfoDataList 无效或为空");
		return result;
	}

	list.forEach((item) => {
		const place = item?.place;
		const rows = Array.isArray(item?.data) ? item.data : [];
		const mapped = rows.map(mapVisitorRow);
		const number = Number(item?.number || mapped.length || 0);

		if (place === "济南") {
			result.attendeesJN = mapped;
			result.checkinJN = number > 0 ? 1 : 0;
		} else if (place === "上海") {
			result.attendeesSH = mapped;
			result.checkinSH = number > 0 ? 1 : 0;
		}
	});

	return result;
}

// 子函数 4：写入 localStorage（与原键名一致） ——
function saveAttendanceToLocal(attendeesJN, attendeesSH) {
	localStorage.setItem("attendees_Web", JSON.stringify({
		attendeesJN,
		attendeesSH
	}));
}

// 子函数 5：写 cookie（依赖你已有 setCookie 实现） ——
function writeCheckinCookies(checkinJN, checkinSH) {
	setCookie("checkinJN", String(checkinJN));
	setCookie("checkinSH", String(checkinSH));
	console.log("[fetchAndStoreAttendanceData] set checkinJN and checkinSH cookies:", {
		checkinJN,
		checkinSH
	});
}

// 子函数 6：汇总日志 ——
function logSummary(parsed) {
	console.log("[status-sync]", {
		checkinJN: parsed.checkinJN,
		checkinSH: parsed.checkinSH,
		sizeJN: parsed.attendeesJN.length,
		sizeSH: parsed.attendeesSH.length,
	});
}

// 主函数：保持原函数名与入参不变 
async function fetchAndStoreAttendanceData(authToken) {
	try {
		const raw = await fetchCheckData(authToken); // 拉数据
		const parsed = parseVisitorList(raw); // 解析
		saveAttendanceToLocal(parsed.attendeesJN, parsed.attendeesSH); // 落地
		logSummary(parsed); // 打印
		writeCheckinCookies(parsed.checkinJN, parsed.checkinSH); // 写 cookie
	} catch (e) {
		console.error("[fetchAndStoreAttendanceData] 出错:", e);
	}
}


































/** ========== 1. 取会场信息 ========== */
function getPlaceFromSession(vm){
  const sessionKey = localStorage.getItem('exh_session_key'); // 'JN' | 'SH'
  const place = vm.sessions?.[sessionKey]?.city || vm.selectedSession?.city || '';
  return { sessionKey, place };
}

/** ========== 2. 校验出席人 ========== */
function validateVisitor(v, idx){
  const tag = `第${idx+1}位出席人`;
  if(!v?.name?.trim()) throw new Error(`${tag}：请输入姓名`);
  if(!/^1[3-9]\d{9}$/.test(v?.mobile||'')) throw new Error(`${tag}：请输入有效的11位手机号`);
  if(!v?.company?.trim()) throw new Error(`${tag}：请输入公司名称`);
  if(!v?.title?.trim()) throw new Error(`${tag}：请输入职位`);
  if(v?.needHotel === 'yes'){
    if(!v.hotelPlan) throw new Error(`${tag}：请选择住宿类型`);
    if(!v.stayNights?.length) throw new Error(`${tag}：请选择住宿日期`);
  }
}

/** ========== 3. 住宿字段规范化 ========== */
function normalizeHotelPlan(v){
  const map = { single:'单人间', twin:'大床房', '标间':'单人间', '单人间':'单人间', '大床房/双人间':'大床房', '大床房':'大床房' };
  return (v==null || v==='') ? '' : (map[v] ?? v);
}
function normalizeHotelDate(v){
  return (v==null || v==='') ? '' : String(v).replace(/晚$/, '晚上');
}

/** ========== 4. 读取本地出席人（分场次） ========== */
function readLocalAttendees(){
  const JN = JSON.parse(localStorage.getItem('attendees_JN')||'[]');
  const SH = JSON.parse(localStorage.getItem('attendees_SH')||'[]');
  return { JN, SH };
}

/** ========== 5. 映射为后端数据结构 ========== */
function toBackendVisitor(a){
  return {
    receptionistName: a.name.trim(),
    sex: a.gender === '女' ? 0 : 1,      // 1=男, 0=女
    phoneNo: a.mobile,
    company: a.company.trim(),
    position: a.title.trim(),
    needHotel: a.needHotel === 'yes' ? 'yes' : 'no',
    hotelPlan: a.needHotel === 'yes' ? normalizeHotelPlan(a.hotelPlan) : '',
    hotelDate: a.needHotel === 'yes' ? (a.stayNights||[]).map(normalizeHotelDate).join('、') : '',
  };
}

/** ========== 6. 组装 visitorInfoDataList ========== */
function buildVisitorInfoDataList(){
  const { JN, SH } = readLocalAttendees();
  const dataJN = JN.map(toBackendVisitor);
  const dataSH = SH.map(toBackendVisitor);
  return [
    { place:'济南', number: dataJN.length, data: dataJN },
    { place:'上海', number: dataSH.length, data: dataSH }
  ];
}

/** ========== 7. 带签名的请求头 ========== */
function buildSignedHeaders(authToken, userMobile, place, extra={}){
  const h = new Headers({ 'Content-Type':'application/json', 'X-Auth-Token': authToken, ...extra });
  const timestamp = String(Math.floor(Date.now()/1000));
  const sign = md5(timestamp + userMobile + place); // md5(ts + 手机号 + 地点)
  h.append('Sign', sign);
  return { headers: h, timestamp, sign };
}

/** ========== 8. 查询是否已提交过（/cs/check） ========== */
async function checkHasSubmitted(headers){
  const url = apiUrl('/cs/check');
  console.log('[submitSignup2] GET', url);
  const res = await fetch(url, { method:'GET', headers });
  console.log('[submitSignup2] /cs/check status:', res.status);
  if(!res.ok) throw new Error('校验是否已提交失败：' + res.status);
  const j = await res.json().catch(()=>({}));
  console.log('[submitSignup2] /cs/check resp:', j);
  if(j.code !== 0) throw new Error(j.message || '校验接口返回异常');
  return j.data !== null; // null=未提交
}

/** ========== 9. 确保有 customerId（用于更新） ========== */
async function ensureCustomerId(customerId, headers){
  if (customerId) return customerId;
  const url = apiUrl('/cs/user/info');
  console.log('[submitSignup2] GET', url);
  const res = await fetch(url, { method:'GET', headers });
  console.log('[submitSignup2] /cs/user/info status:', res.status);
  if(!res.ok) throw new Error('获取用户信息失败：' + res.status);
  const j = await res.json().catch(()=>({}));
  console.log('[submitSignup2] /cs/user/info resp:', j);
  if(j.code !== 0 || !j.data) throw new Error(j.message || '获取用户信息返回异常');
  const cid = j?.data?.customerId || '';
  if (cid) setCookie('customerId', cid);
  return cid;
}

/** ========== 10. 提交登记或更新（含“重复→转更新”兜底） ========== */
async function postAppointmentOrUpdate({ headers, basePayload, hasSubmitted, customerId }) {
  let path = hasSubmitted ? '/cs/update' : '/cs/appointment';
  let payload = { ...basePayload, ...(hasSubmitted ? { customerId } : {}) };

  async function post(path, payload){
    const url = apiUrl(path);
    console.log('[submitSignup2] POST', url);
    const res = await fetch(url, { method:'POST', headers, body: JSON.stringify(payload) });
    const raw = await res.text();
    console.log(`[submitSignup2] ${path} status:`, res.status, 'raw:', raw);
    let json={}; try{ json = JSON.parse(raw); }catch{}
    return json;
  }

  let json = await post(path, payload);

  // 失败兜底：新建撞唯一键，则转更新
  if (json.code !== 0) {
    const msg = json.message || '';
    const duplicate = /Duplicate entry/i.test(msg);
    console.warn('[submitSignup2] POST failed:', { msg, duplicate });

    if (path === '/cs/appointment' && duplicate) {
      const cid = payload.customerId || customerId;
      if (!cid) throw new Error('重复提交但无法获取customerId，请重新登录');
      path = '/cs/update';
      payload = { ...basePayload, customerId: cid };
      json = await post(path, payload);
      if (json.code !== 0) throw new Error(json.message || '更新失败');
      return { json, path };
    } else {
      throw new Error(msg || (hasSubmitted ? '更新失败' : '登记失败'));
    }
  }

  return { json, path };
}

/** ========== 11. 成功后的本地落库与 Cookie ========== */
async function persistAfterSuccess({ sessionKey, vm }){
  if (sessionKey === 'JN') {
    setCookie('checkinJN', '1');
    localStorage.setItem('attendees_JN', JSON.stringify(vm.attendees));
    console.log('[submitSignup2] saved attendees_JN');
  } else if (sessionKey === 'SH') {
    setCookie('checkinSH', '1');
    localStorage.setItem('attendees_SH', JSON.stringify(vm.attendees));
    console.log('[submitSignup2] saved attendees_SH');
  }

  // 没有 customerId 时再刷新一次（与原逻辑一致）
  if (!getCookie('customerId')) {
    const { headers } = buildSignedHeaders(getCookie('auth_token'), getCookie('user_mobile'), vm.sessions?.[sessionKey]?.city||'');
    const url = apiUrl('/cs/user/info');
    const res = await fetch(url, { method:'GET', headers });
    const j = await res.json().catch(()=>({}));
    const cid = j?.data?.customerId;
    if (cid) {
      setCookie('customerId', cid);
      console.log('[submitSignup2] setCookie customerId (refresh):', cid);
    }
  }
}

/** ========== 12. 入口校验（token、mobile、attendees） ========== */
function validateEntry(vm){
  const authToken = getCookie('auth_token');
  const userMobile = getCookie('user_mobile');
  if(!authToken) throw new Error('未找到登录凭证，请重新登录');
  if(!userMobile) throw new Error('未找到用户手机号，请重新登录');

  if(!Array.isArray(vm.attendees) || vm.attendees.length===0){
    throw new Error('请先新增至少一位出席人员');
  }
  vm.attendees.forEach((a, idx)=>validateVisitor(a, idx));
  return { authToken, userMobile };
}



