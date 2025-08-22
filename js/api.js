// 获取并存储参会信息到localstorage里
async function fetchAndStoreAttendanceData(authToken) {
	try {
		// 请求参会信息
		const checkUrl = apiUrl("/cs/check");
		const headers = new Headers({
			"X-Auth-Token": authToken
		});
		console.log("[GET] 获取参会信息:", checkUrl);

		const checkRes = await fetch(checkUrl, {
			method: "GET",
			headers
		});

		console.log("[/cs/check] status:", checkRes.status);
		if (!checkRes.ok) throw new Error("校验接口失败: " + checkRes.status);

		const checkJson = await checkRes.json();
		console.log("[/cs/check] response:", checkJson);

		// 校验接口返回异常
		if (checkJson.code !== 0) {
			throw new Error(checkJson.message || "校验接口返回异常");
		}

		// ---------- 判断参会信息，并存储到 localStorage ----------
		let checkinJN = 0,
			checkinSH = 0; // 默认未登记
		let attendeesData = {};

		// 如果 data 为 null，表示从未登记过
		if (checkJson.data === null) {
			console.log("[/cs/check] data 为 null，表示从未登记过");
			attendeesData = {
				attendeesJN: [],
				attendeesSH: []
			};
		} else {
			// 确保 visitorInfoDataList 存在且是一个有效的数组
			const visitorInfoDataList = checkJson.data.visitorInfoDataList || [];

			// 处理 visitorInfoDataList，根据 place 更新参会状态
			if (Array.isArray(visitorInfoDataList) && visitorInfoDataList.length > 0) {
				visitorInfoDataList.forEach((item) => {
					const place = item.place;
					if (place === "济南") {
						attendeesData.attendeesJN = item.data.map((v) => ({
							name: v.receptionistName,
							gender: v.sex === 1 ? "男" : "女",
							mobile: v.phoneNo,
							company: v.company,
							title: v.position,
							hotelDate: v.hotelDate,
							hotelPlan: v.hotelPlan,
							needHotel: v.needHotel === "yes",
						}));

						// 根据 number 判断是否已登记
						if (item.number > 0) {
							checkinJN = 1;
						} else {
							checkinJN = 0;
						}
					} else if (place === "上海") {
						attendeesData.attendeesSH = item.data.map((v) => ({
							name: v.receptionistName,
							gender: v.sex === 1 ? "男" : "女",
							mobile: v.phoneNo,
							company: v.company,
							title: v.position,
							hotelDate: v.hotelDate,
							hotelPlan: v.hotelPlan,
							needHotel: v.needHotel === "yes",
						}));

						// 根据 number 判断是否已登记
						if (item.number > 0) {
							checkinSH = 1;
						} else {
							checkinSH = 0;
						}
					}
				});
			} else {
				console.warn("[/cs/check] visitorInfoDataList 无效或为空");
			}
		}

		// 将参会数据存储到 localStorage
		localStorage.setItem("attendees_Web", JSON.stringify(attendeesData));
		console.log("[status-sync]", {
			checkinJN,
			checkinSH,
			sizeJN: attendeesData.attendeesJN.length,
			sizeSH: attendeesData.attendeesSH.length,
		});

		// 设置 checkinJN 和 checkinSH 的 Cookie
		setCookie('checkinJN', String(checkinJN));
		setCookie('checkinSH', String(checkinSH));
		console.log("[fetchAndStoreAttendanceData] set checkinJN and checkinSH cookies:", {
			checkinJN,
			checkinSH
		});

	} catch (e) {
		console.error("[fetchAndStoreAttendanceData] 出错:", e);
	}
}








// 从 localStorage 获取并解析参会人员数据，按场次分配
function parseAttendeesData() {
	// 获取参会人员数据
	const attendeesData = JSON.parse(localStorage.getItem("attendees_Web") || "{}");

	// 如果没有数据，直接返回
	if (!attendeesData) {
		console.warn("没有参会人员数据");
		return;
	}

	// 将数据按场次分配到 JN 和 SH
	const attendeesJN = attendeesData.attendeesJN || [];
	const attendeesSH = attendeesData.attendeesSH || [];

	// 将数据分别存储到 localStorage 中
	localStorage.setItem("attendees_JN", JSON.stringify(attendeesJN));
	localStorage.setItem("attendees_SH", JSON.stringify(attendeesSH));

	console.log("参会人员数据已解析并存储到 localStorage");
}

// 根据选择的会议场次加载对应的数据
function loadAttendeesBySession() {
	// 获取场次信息
	const sessionKey = localStorage.getItem("exh_session_key"); // 'JN' 或 'SH'

	// 根据场次选择加载对应的数据
	let attendees = [];
	if (sessionKey === "JN") {
		attendees = JSON.parse(localStorage.getItem("attendees_JN") || "[]");
	} else if (sessionKey === "SH") {
		attendees = JSON.parse(localStorage.getItem("attendees_SH") || "[]");
	}

	// 将加载的出席人员信息存储到 Vue 的 data 中（可以在组件中使用）
	this.attendees = attendees;

	console.log("当前场次的出席人员：", attendees);
}