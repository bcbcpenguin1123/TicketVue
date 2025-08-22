// 步骤0：获取后缀
function getQueryParam() {
	// 获取当前 URL 的查询参数部分
	const params = new URLSearchParams(window.location.search);

	// 解析 inviter
	const inviter = params.get("inviter");

	// 打印到控制台
	console.log("inviter =", inviter);
}





// 步骤1：未登录处理

function handleNotLoggedIn() {
	setCookie('login_status', '0');
	localStorage.removeItem('attendees_Web');
	localStorage.removeItem('attendees_JN');
	localStorage.removeItem('attendees_SH');
}

// 步骤2：请求用户信息 /cs/user/info
// 返回：{ customerId, phoneNo, status }

async function fetchUserInfo(authToken) {
	const headers = new Headers({
		'X-Auth-Token': authToken
	});
	const url = apiUrl('/cs/user/info');
	const res = await fetch(url, {
		method: 'GET',
		headers
	});

	if (!res.ok) throw new Error('用户信息接口失败: ' + res.status);
	const json = await res.json();

	if (json.code !== 0 || !json.data) throw new Error(json.message || '用户信息返回异常');
	const {
		customerId,
		phoneNo,
		status
	} = json.data || {};
	if (!customerId || !phoneNo) throw new Error('缺少必要用户信息 customerId 或 phoneNo');
	return {
		customerId,
		phoneNo,
		status
	}
}

// 步骤3：缓存用户信息到 Cookie
function cacheUserInfoToCookies(userInfo) {
	var customerId = userInfo.customerId;
	var phoneNo = userInfo.phoneNo;
	var status = userInfo.status;

	setCookie("login_status", "1");
	setCookie("customerId", customerId);

	var statusValue = (status === undefined || status === null) ? "" : String(status);
	setCookie("userStatus", statusValue);

	var existingPhone = getCookie("user_mobile");
	if (!existingPhone) {
		setCookie("user_mobile", phoneNo);
	}
}

// 步骤4：请求参会信息 /cs/check
// 返回后端原始 json.data（可能为 null）
async function fetchAttendanceRaw(authToken) {
	const headers = new Headers({
		"X-Auth-Token": authToken
	});
	const url = apiUrl("/cs/check");
	const response = await fetch(url, {
		method: "GET",
		headers
	});

	if (!response.ok) {
		throw new Error("校验接口失败: " + response.status);
	}

	const responseJson = await response.json();
	if (responseJson.code !== 0) {
		throw new Error(responseJson.message || "校验接口返回异常");
	}

	// data 允许为 null，不报警
	const resultData = responseJson.data ?? null;

	console.log("[/cs/check] 返回:", responseJson);
	return resultData;
}



// 步骤5：解析参会信息为本地结构
// 输入：/cs/check 的 data（可能为 null）
// 输出：{ attendeesJN:[], attendeesSH:[], checkinJN:0|1, checkinSH:0|1 }
function parseAttendanceData(data) {
	var result = {
		attendeesJN: [],
		attendeesSH: [],
		checkinJN: 0,
		checkinSH: 0
	};

	if (data === undefined || data === null) {
		return result;
	}

	var list;
	if (Array.isArray(data.visitorInfoDataList)) {
		list = data.visitorInfoDataList;
	} else {
		list = [];
	}

	for (var i = 0; i < list.length; i++) {
		var item = list[i];

		var place;
		if (item && item.place !== undefined) {
			place = item.place;
		} else {
			place = null;
		}

		var rows;
		if (item && Array.isArray(item.data)) {
			rows = item.data;
		} else {
			rows = [];
		}

		var mapped = [];
		for (var j = 0; j < rows.length; j++) {
			var v = rows[j];

			var mappedItem = {
				name: v.receptionistName,
				gender: (v.sex === 1 ? "男" : "女"),
				mobile: v.phoneNo,
				company: v.company,
				title: v.position,
				hotelDate: v.hotelDate,
				hotelPlan: v.hotelPlan,
				needHotel: (v.needHotel === "yes" ? true : false)
			};

			mapped.push(mappedItem);
		}

		if (place === "济南") {
			result.attendeesJN = mapped;
			if (mapped.length > 0) {
				result.checkinJN = 1;
			} else {
				result.checkinJN = 0;
			}
		} else if (place === "上海") {
			result.attendeesSH = mapped;
			if (mapped.length > 0) {
				result.checkinSH = 1;
			} else {
				result.checkinSH = 0;
			}
		}
	}

	return result;
}

/**
 * 新步骤6：拉取二维码信息并直接写入 cookies（不写 localStorage）
 * - 正常返回：返回后端 data（可能为 null）
 * - 异常/报错：写入清空态（access=0, qrCode/qrStatus=''），同时返回 null，不抛错误
 */
async function fetchAndStoreQrCode(authToken, customerId) {
	// ---- 内部：状态归一化 ----
	const normalizeStatus = (val) =>
		(typeof val === 'string' && val.trim().toLowerCase() === 'approved') ? 1 : 0;

	// ---- 内部：写 cookies（接受空对象）----
	const writeQrCookies = ({
		statusShanghai = null,
		statusJinan = null,
		qrCode = '',
		qrStatus = ''
	} = {}) => {
		const accessSH = normalizeStatus(statusShanghai);
		const accessJN = normalizeStatus(statusJinan);
		setCookie('access_statusSH', accessSH);
		setCookie('access_statusJN', accessJN);
		setCookie('qrCode', qrCode ?? '');
		setCookie('qrStatus', qrStatus ?? '');
		console.log('[qr-cookies]', {
			accessSH,
			accessJN,
			qrCode,
			qrStatus
		});
	};

	try {
		const headers = new Headers({
			"X-Auth-Token": authToken
		});
		const url = apiUrl(`/cs/qrcode?id=${encodeURIComponent(customerId)}`);
		const resp = await fetch(url, {
			method: "GET",
			headers
		});

		if (!resp.ok) throw new Error("二维码接口失败: " + resp.status);

		const json = await resp.json();
		if (json.code !== 0) throw new Error(json.message || "二维码接口返回异常");

		const data = json.data ?? null; // 允许为 null
		console.log("[/cs/qrcode] 返回:", json);

		// data 为 null 也正常落空态
		writeQrCookies(data || {});
		return data;
	} catch (err) {
		console.warn("[fetchAndStoreQrCode] 已兜底为空态：", err?.message || err);
		// 出错时写入空态，避免中断后续逻辑
		writeQrCookies({});
		return null;
	}
}

// 步骤7：写入本地存储
function writeAttendanceToLocalStorage({
	attendeesJN,
	attendeesSH
}) {
	localStorage.setItem('attendees_Web', JSON.stringify({
		attendeesJN,
		attendeesSH
	}));
}




/**
 * 将 localStorage 中的 attendees_Web 拆分为 attendees_JN / attendees_SH 并写回本地。
 * 兼容几种常见形态：
 * 1) { attendeesJN: [...], attendeesSH: [...] }                // 你当前主要使用的结构
 * 2) { visitorInfoDataList: [{place:"济南"|"上海", data:[...]}] } // 来自 /cs/check 的原始形态
 * 3) 数组（不推荐；尽量避免，但这里做了兜底按 place/sessionKey 拆）
 */
function writePerSessionAttendeesFromWeb() {
	let webRaw = localStorage.getItem("attendees_Web");
	if (!webRaw) {
		console.warn("[writePerSessionAttendeesFromWeb] 未找到 attendees_Web");
		localStorage.setItem("attendees_JN", "[]");
		localStorage.setItem("attendees_SH", "[]");
		// 计算并写 cookie
		setCookie("checkinJN", "0");
		setCookie("checkinSH", "0");
		console.log("[writePerSessionAttendeesFromWeb] counts -> JN:0, SH:0");
		return;
	}

	let web;
	try {
		web = JSON.parse(webRaw);
	} catch (e) {
		console.error("[writePerSessionAttendeesFromWeb] 解析 attendees_Web 出错：", e);
		localStorage.setItem("attendees_JN", "[]");
		localStorage.setItem("attendees_SH", "[]");
		setCookie("checkinJN", "0");
		setCookie("checkinSH", "0");
		console.log("[writePerSessionAttendeesFromWeb] counts -> JN:0, SH:0");
		return;
	}

	// 形态 A：{ attendeesJN, attendeesSH }
	if (web && Array.isArray(web.attendeesJN) && Array.isArray(web.attendeesSH)) {
		localStorage.setItem("attendees_JN", JSON.stringify(web.attendeesJN));
		localStorage.setItem("attendees_SH", JSON.stringify(web.attendeesSH));
		const countJN = web.attendeesJN.length;
		const countSH = web.attendeesSH.length;
		setCookie("checkinJN", countJN > 0 ? "1" : "0");
		setCookie("checkinSH", countSH > 0 ? "1" : "0");
		console.log("[writePerSessionAttendeesFromWeb] 形态A写入完成，counts -> JN:%d, SH:%d", countJN, countSH);
		return;
	}

	// 形态 B：{ visitorInfoDataList: [...] }
	if (web && Array.isArray(web.visitorInfoDataList)) {
		const list = web.visitorInfoDataList;
		let jn = [];
		let sh = [];
		for (const item of list) {
			const place = item && item.place;
			const rows = Array.isArray(item && item.data) ? item.data : [];
			if (place === "济南") jn = rows;
			else if (place === "上海") sh = rows;
		}
		localStorage.setItem("attendees_JN", JSON.stringify(jn));
		localStorage.setItem("attendees_SH", JSON.stringify(sh));
		const countJN = jn.length;
		const countSH = sh.length;
		setCookie("checkinJN", countJN > 0 ? "1" : "0");
		setCookie("checkinSH", countSH > 0 ? "1" : "0");
		console.log("[writePerSessionAttendeesFromWeb] 形态B写入完成，counts -> JN:%d, SH:%d", countJN, countSH);
		return;
	}

	// 形态 C：数组兜底（尽量不用；尝试按 place 或 sessionKey 切）
	if (Array.isArray(web)) {
		const jn = web.filter(x => x && (x.place === "济南" || x.city === "济南" || x.sessionKey === "JN"));
		const sh = web.filter(x => x && (x.place === "上海" || x.city === "上海" || x.sessionKey === "SH"));
		localStorage.setItem("attendees_JN", JSON.stringify(jn));
		localStorage.setItem("attendees_SH", JSON.stringify(sh));
		const countJN = jn.length;
		const countSH = sh.length;
		setCookie("checkinJN", countJN > 0 ? "1" : "0");
		setCookie("checkinSH", countSH > 0 ? "1" : "0");
		console.log("[writePerSessionAttendeesFromWeb] 形态C写入完成，counts -> JN:%d, SH:%d", countJN, countSH);
		return;
	}

	// 其他未知结构 → 清空，避免脏数据
	console.warn("[writePerSessionAttendeesFromWeb] attendees_Web 结构未知，已清空分场次存储");
	localStorage.setItem("attendees_JN", "[]");
	localStorage.setItem("attendees_SH", "[]");
	setCookie("checkinJN", "0");
	setCookie("checkinSH", "0");
	console.log("[writePerSessionAttendeesFromWeb] counts -> JN:0, SH:0");
}



