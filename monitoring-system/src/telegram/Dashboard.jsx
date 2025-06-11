import React, { useEffect, useState } from 'react'
import {
	Row,
	Col,
	Card,
	Typography,
	Button,
	Modal,
	Slider,
	Input,
	InputNumber,
	Spin,
	Space,
	message,
	DatePicker,
	TimePicker,
	Select,
} from 'antd'
import { QRCodeSVG } from 'qrcode.react'
import Carousel from 'react-multi-carousel';
import 'react-multi-carousel/lib/styles.css';
import img1 from '../img/1.jpg'
import img2 from '../img/2.jpg'
import img3 from '../img/3.jpg'
import {
	WhatsAppOutlined,
	InstagramOutlined,
	CheckOutlined,
	LoadingOutlined,
	LeftOutlined,
	ClockCircleOutlined,
	SoundOutlined,
	TeamOutlined,
	CloseCircleOutlined,
} from '@ant-design/icons'
import { FaTelegramPlane } from 'react-icons/fa'
import { useNavigate } from 'react-router-dom'
import { useMediaQuery } from 'react-responsive'
import { setSavedData, setsavedDataInst } from '../Slice/setSavedDataSlice.js'
import { useDispatch, useSelector } from 'react-redux'
import { Config } from '../Slice/config.js'
import HeaderMain from './Header.jsx'
import FooterMain from './Footer.jsx'
import {
	setCompanyName,
	setResponseTime,
	setQrAccess,
	setQrCode,
	setCompanyId,
	setUrlTelegram,
	setWhatsappPhoneNumber,
	setWorkingHoursStart,
	setWorkingHoursEnd,
} from '../Slice/createCompanySlice.js'
import {
	setUrlTelegramInst,
	setResponseTimeInst,
	setCompanyNameInst,
	setQrAccessInst,
	setCompanyIdInst,
	setInstagramConnected,
} from '../Slice/createCompanyInstSlice'
import { v4 as uuidv4 } from 'uuid'
import io from 'socket.io-client'
import moment from 'moment'

const { Text, Title, Link, Paragraph } = Typography
const { RangePicker } = TimePicker

const responsive = {
	mobile: {
		breakpoint: { max: 767, min: 0 },
		items: 1,
		slidesToSlide: 1,
	},
};


export default function Dashboard() {
	const [timeRange, setTimeRange] = useState(null)
	const [verificationCode, setVerificationCode] = useState(null)
	const [isVerificationLoading, setIsVerificationLoading] = useState(false)
	const working_hours_start = useSelector(
		state => state.createCompanySlice.working_hours_start
	)
	const working_hours_end = useSelector(
		state => state.createCompanySlice.working_hours_end
	)
	const dispatch = useDispatch()

	useEffect(() => {
		if (timeRange) {
			dispatch(setWorkingHoursStart(timeRange[0].format('HH:mm')))
			dispatch(setWorkingHoursEnd(timeRange[1].format('HH:mm')))
		}
	}, [timeRange, dispatch])

	const urlBack = Config.apiUrl
	const urlTelegram = useSelector(state => state.createCompanySlice.urlTelegram)
	const [isModalSettingWhatsapp, setisModalSettingWhatsapp] = useState(false)
	const [isModalSettingInst, setisModalSettingInst] = useState(false)
	const savedData = useSelector(state => state.setSavedData.savedData)

	const [isLoading, setIsLoading] = useState(false)
	const userId = localStorage.getItem('userId')

	const [selectedCompanyid, setSelectedCompanyId] = useState(null)
	const [step, setStep] = useState(2);

	const savedDataInst = useSelector(state => state.setSavedData.savedDataInst)
	const navigate = useNavigate()

	const [isModalOpen, setIsModalOpen] = useState(false)
	const [isModalOpenInst, setIsModalOpenInst] = useState(false)

	const whatsappPhoneNumber = useSelector(
		state => state.createCompanySlice.whatsappPhoneNumber
	)
	const [isStepThreeVisible, setIsStepThreeVisible] = useState(false);
	const companyId = useSelector(state => state.createCompanySlice.companyId)
	const companyIdInst = useSelector(
		state => state.createCompanyInst.companyIdInst
	)

	const urlTelegramInst = useSelector(
		state => state.createCompanyInst.urlTelegramInst
	)

	const [statusCheckInterval, setStatusCheckInterval] = useState(null)
	const [companyUrls, setCompanyUrls] = useState({});
	const [loadingUrls, setLoadingUrls] = useState({});

	const showModal = () => {
		dispatch(setCompanyName(''))
		setIsModalOpen(true)
		setStep(qrAccess ? 2 : 1) // если QR уже отсканирован, открываем сразу с шага 2

	}

	const showModalInst = () => {
		setIsModalOpenInst(true)
	}

	const responseTime = useSelector(
		state => state.createCompanySlice.responseTime
	)
	const responseTimeInst = useSelector(
		state => state.createCompanyInst.responseTimeInst
	)
	const companyName = useSelector(state => state.createCompanySlice.companyName)
	const companyNameInst = useSelector(
		state => state.createCompanyInst.companyNameInst
	)
	const qrAccess = useSelector(state => state.createCompanySlice.qrAccess)
	const qrAccessInst = useSelector(
		state => state.createCompanyInst.qrAccessInst
	)
	const qrCode = useSelector(state => state.createCompanySlice.qrCode)

	const qrCodeInst = useSelector(state => state.createCompanyInst.qrCodeInst)

	const handleConnect = async () => {
		try {
			setIsLoading(true)
			const response = await fetch(`${urlBack}/api/instagram/url`, {
				headers: {
					'Cache-Control': 'no-cache, no-store, must-revalidate',
					'Pragma': 'no-cache',
					'Expires': '0'
				},
			})
			const { url } = await response.json()

			window.open(`${url}&state=${userId}`, '_blank', 'width=600,height=600')
		} catch (err) {
			console.error(err)
		} finally {
			setIsLoading(false)
		}
	}

	const InstagramStatus = companyIdInstTest => {
		const [status, setStatus] = useState('disconnected')

		useEffect(() => {
			const checkStatus = async () => {
				try {
					const response = await fetch(
						`${urlBack}/api/company/${companyIdInstTest}`
					)
					const data = await response.json()

					if (data.instagramUserId) {
						setStatus('connected')
					} else {
						setStatus('disconnected')
					}
				} catch (err) {
					setStatus('error')
				}
			}

			checkStatus()
		}, [companyIdInstTest])

		return status
	}

	useEffect(() => {
		dispatch(setQrAccess(false))
	}, [])

	const socket = io(`${urlBack}`, {
		path: '/ws',
		transports: ['websocket'], // Используем только websocket транспорт
		auth: {
			token: localStorage.getItem('authToken'),
			userId: localStorage.getItem('userId'),
		},
	})

	// События
	socket.on('connect', () => {
		// 	console.log('✅ Подключено к серверу:', socket.id)
	})

	// Получение QR-кода
	socket.on(`user:qr:${userId}`, data => {
		// console.log('Получен QR-код:', data)
		dispatch(setQrCode(data.qr)) // Устанавливаем QR-код для отображения
	})

	// Событие сканирования QR-кода
	socket.on(`user:${userId}:scanned`, data => {
		// console.log('QR-код отсканирован:', data)
		dispatch(setQrAccess(true)) // Устанавливаем доступ в true
	})

	// Событие готовности
	socket.on(`user:${userId}:ready`, data => {
		console.log('Клиент готов:', data)
		// dispatch(setCompanyId(data.companyId))
		setSelectedCompanyId(data.companyId)
		dispatch(setQrAccess(true)) // Устанавливаем доступ в true
		if (data.phoneNumber) {
			dispatch(setWhatsappPhoneNumber(data.phoneNumber))
		}
	})

	useEffect(() => {
		const stored = localStorage.getItem(`whatsappData-${userId}`)
		console.log('stored:', stored)
		if (stored) {
			const parsed = JSON.parse(stored)
			dispatch(setSavedData(parsed))
			const found = parsed.find(item => item._id === selectedCompanyid)
			if (found) {
				dispatch(setResponseTime(found.managerResponse || 5))
				dispatch(setCompanyName(found.nameCompany || ''))
				// dispatch(setCompanyId(found._id))
				setSelectedCompanyId(found._id)
				if (
					found.working_hours_start &&
					found.working_hours_end &&
					found.working_hours_start.trim() !== '' &&
					found.working_hours_end.trim() !== ''
				) {
					setTimeRange([
						moment(found.working_hours_start, 'HH:mm'),
						moment(found.working_hours_end, 'HH:mm'),
					])
				} else {
					setTimeRange(null)
				}
			}
		}
	}, [])

	useEffect(() => {
		const getQRCode = async () => {
			try {
				const cid = selectedCompanyid
				console.log('companyId:', cid)
				const response = await fetch(`${urlBack}/api/whatsapp/qr`, {
					headers: {
						Authorization: `Bearer ${localStorage.getItem('authToken')}`,
					},
					...(cid
						? {
								body: {
									companyId: cid,
								},
						  }
						: {}),
					method: 'POST',
				})

				const data = await response.json()

				if (response.ok) {
					console.log('CompanyId set to:', data.user.companyId)
					// dispatch(setCompanyId(data.user.companyId)) TEST
				}

				if (data.status === 'ready') {
					dispatch(setQrAccess(true))
				}
			} catch (error) {
				console.error('Ошибка при получении QR-кода:', error)
			}
		}

		getQRCode()
	}, [])

	useEffect(() => {
		dispatch(setCompanyName(''))
		dispatch(setResponseTime(1))
	}, [dispatch])

	useEffect(() => {
		dispatch(setCompanyNameInst(''))
		dispatch(setResponseTimeInst(1))
	}, [dispatch])

	// Очистка подписок при размонтировании компонента
	useEffect(() => {
		return () => {
			socket.off(`user:qr:${userId}`)
			socket.off(`user:${userId}:scanned`)
			socket.off(`user:${userId}:ready`)
		}
	}, [userId])

	const handleSliderChange = value => {
		dispatch(setResponseTime(value))
	}

	const handleSliderChangeInst = value => {
		dispatch(setResponseTimeInst(value))
	}

	// localStorage.removeItem(`whatsappData-${userId}`)

	const saveData = () => {
		const newCompanyId = uuidv4()

		const newEntry = {
			userId: userId,
			nameCompany: companyName,
			managerResponse: Number(responseTime),
			idCompany: newCompanyId,
			companyId: selectedCompanyid,
			phoneNumber: whatsappPhoneNumber,
			working_hours_start: working_hours_start,
			working_hours_end: working_hours_end,
		}
		setSelectedCompanyId(newEntry.companyId)
		console.log(newEntry)

		fetch(`${urlBack}/api/company/settings`, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				Authorization: `Bearer ${localStorage.getItem('authToken')}`,
			},
			body: JSON.stringify(newEntry),
		})
			.then(response => {
				if (!response.ok) {
					return response.json().then(err => {
						throw new Error(err.message || 'Ошибка при отправке данных')
					})
				}
				return response.json()
			})
			.then(data => {
				console.log(data)
				const updatedData = [
					...savedData,
					{
						_id: selectedCompanyid,
						managerResponse: Number(responseTime),
						nameCompany: companyName,
						working_hours_start: working_hours_start,
						working_hours_end: working_hours_end,
						urlTelegram: urlTelegram
					},
				]

				dispatch(setSavedData(updatedData))

				localStorage.setItem(
					`whatsappData-${userId}`,
					JSON.stringify(updatedData)
				)
				GetData()
				navigate('/Dashboard')
				setIsModalOpen(false)

				changeWhatsApp()
			})
			.catch(error => {
				console.error('Ошибка:', error.message)
				message.error(error.message)
			})
	}

	const changeWhatsApp = () => {
		// Формируем обновленные данные
		const updatedCompany = {
			_id: selectedCompanyid,
			nameCompany: companyName,
			managerResponse: Number(responseTime),
			working_hours_start: working_hours_start,
			working_hours_end: working_hours_end,
		}

		// Отправляем запрос на сервер для обновления данных
		fetch(
			`${urlBack}/api/company/settings/${localStorage.getItem(
				'userId'
			)}/${selectedCompanyid}`,
			{
				method: 'PUT',
				headers: {
					'Content-Type': 'application/json',
					Authorization: `Bearer ${localStorage.getItem('authToken')}`,
				},
				body: JSON.stringify(updatedCompany), // Отправляем новые данные
			}
		)
			.then(response => {
				if (!response.ok) {
					return response.json().then(err => {
						throw new Error(err.message || 'Ошибка при обновлении данных')
					})
				}
				return response.json()
			})
			.then(data => {
				// Если сервер успешно обновил данные, обновляем их локально
				const stored = localStorage.getItem(`whatsappData-${userId}`)

				if (stored) {
					let parsed = JSON.parse(stored)

					// Обновляем нужную запись по id
					parsed = parsed.map(item =>
						item._id === selectedCompanyid ? updatedCompany : item
					)

					// Сохраняем обновленные данные обратно в localStorage
					localStorage.setItem(`whatsappData-${userId}`, JSON.stringify(parsed))
					dispatch(setSavedData(parsed))
					// dispatch(setCompanyId(data._id))
					setSelectedCompanyId(data._id)

					// dispatch(setCompanyId(data._id)) TEST
					GetData()
					setisModalSettingWhatsapp(false)
				}
			})
			.catch(error => {
				console.error('Ошибка при обновлении компании:', error.message)
			})
	}

	const changeInst = () => {
		// Формируем обновленные данные    change
		const updatedCompany = {
			_id: companyIdInst,
			nameCompany: companyNameInst,
			managerResponse: Number(responseTimeInst),
		}

		// Отправляем запрос на сервер для обновления данных
		// fetch(
		// 	`${urlBack}/api/company/settings/${localStorage.getItem(
		// 		'userId'
		// 	)}/${companyId}`,
		// 	{
		// 		method: 'PUT',
		// 		headers: {
		// 			'Content-Type': 'application/json',
		// 			Authorization: `Bearer ${localStorage.getItem('authToken')}`,
		// 		},
		// 		body: JSON.stringify(updatedCompany), // Отправляем новые данные
		// 	}
		// )
		// 	.then(response => {
		// 		if (!response.ok) {
		// 			return response.json().then(err => {
		// 				throw new Error(err.message || 'Ошибка при обновлении данных')
		// 			})
		// 		}
		// 		return response.json()
		// 	})
		// 	.then(data => {
		// Если сервер успешно обновил данные, обновляем их локально
		const stored = localStorage.getItem(`instData-${userId}`)

		if (stored) {
			let parsed = JSON.parse(stored)

			// Обновляем нужную запись по id
			parsed = parsed.map(item =>
				item._id === companyIdInst ? updatedCompany : item
			)

			// Сохраняем обновленные данные обратно в localStorage
			localStorage.setItem(`instData-${userId}`, JSON.stringify(parsed))
			dispatch(setsavedDataInst(parsed))
			// setSelectedCompanyId(data._id)

			// dispatch(setCompanyIdInst(data._id))
			// GetDataInst() потом добавить после api
		}

		// Перенаправляем на страницу Dashboard после обновления
		navigate('/Dashboard')
		setisModalSettingInst(false)
		// })
		// .catch(error => {
		// 	console.error('Ошибка при обновлении компании:', error.message)
		// })
	}

	const deleteData = () => {
		fetch(
			`${urlBack}/api/company/settings/${localStorage.getItem(
				'userId'
			)}/${selectedCompanyid}`,
			{
				method: 'DELETE',
				headers: {
					'Content-Type': 'application/json',
					Authorization: `Bearer ${localStorage.getItem('authToken')}`,
				},
			}
		)
			.then(response => {
				if (!response.ok) {
					return response.json().then(err => {
						throw new Error(err.message || 'Ошибка при удалении компании')
					})
				}
				return response.json()
			})
			.then(data => {
				// Если сервер успешно удалил данные, удаляем их локально
				const stored = localStorage.getItem(`whatsappData-${userId}`)
				console.log(stored)
				if (stored) {
					let parsed = JSON.parse(stored)
					// Фильтруем компанию по id, чтобы удалить её
					parsed = parsed.filter(item => item._id !== selectedCompanyid)
					// Сохраняем обновленные данные в localStorage
					localStorage.setItem(`whatsappData-${userId}`, JSON.stringify(parsed))
					dispatch(setSavedData(parsed))
				}
					setQrAccess(false);
				// Перенаправляем на другую страницу после удаления
				navigate('/Dashboard')
				setisModalSettingWhatsapp(false)
			})
			.catch(error => {
				console.error('Ошибка при удалении компании:', error.message)
				// Здесь можно добавить уведомление или обработку ошибки
			})
	}

	const deleteDataInst = () => {
		// Выполняем запрос на сервер для удаления компании
		// fetch(
		// 	`${urlBack}/api/company/settings/${localStorage.getItem(
		// 		'userId'
		// 	)}/${companyId}`,
		// 	{
		// 		method: 'DELETE',
		// 		headers: {
		// 			'Content-Type': 'application/json',
		// 			Authorization: `Bearer ${localStorage.getItem('authToken')}`,
		// 		},
		// 	}
		// )
		// 	.then(response => {
		// 		if (!response.ok) {
		// 			return response.json().then(err => {
		// 				throw new Error(err.message || 'Ошибка при удалении компании')
		// 			})
		// 		}
		// 		return response.json()
		// 	})
		// 	.then(data => {
		// Если сервер успешно удалил данные, удаляем их локально
		const stored = localStorage.getItem(`instData-${userId}`)
		console.log('storedInst: ', stored)
		if (stored) {
			let parsed = JSON.parse(stored)
			// Фильтруем компанию по id, чтобы удалить её
			parsed = parsed.filter(item => item._id !== companyIdInst)
			console.log('parse: ', parsed)
			// Сохраняем обновленные данные в localStorage
			localStorage.setItem(`instData-${userId}`, JSON.stringify(parsed))
			dispatch(setsavedDataInst(parsed))
		}
		// Перенаправляем на другую страницу после удаления
		navigate('/Dashboard')
		setisModalSettingInst(false)
		// })
		// .catch(error => {
		// 	console.error('Ошибка при удалении компании:', error.message)
		// 	// Здесь можно добавить уведомление или обработку ошибки
		// })
	}

	const GetLinkTelegramm = async (companyId) => {
		try {
			setLoadingUrls(prev => ({ ...prev, [companyId]: true }));
			const response = await fetch(`${urlBack}/api/company/telegram-link/${userId}/${companyId}`);
			const data = await response.json();
			if (data.success) {
				setCompanyUrls(prev => ({
					...prev,
					[companyId]: data.telegramInviteLink
				}));
				return data.telegramInviteLink;
			}
		} catch (error) {
			console.error('Ошибка при получении ссылки Telegram:', error);
			message.error('Ошибка при генерации QR-кода');
		} finally {
			setLoadingUrls(prev => ({ ...prev, [companyId]: false }));
		}
		return null;
	};

	useEffect(() => {
		if (selectedCompanyid) {
			GetLinkTelegramm(selectedCompanyid)
		}
	}, [companyName, savedData])

	/*inst add*/
	const fetchWhatsAppStatus = userId => {
		if (!qrAccess) {
			fetch(`${urlBack}/api/whatsapp/status/${userId}`, {
				headers: {
					Authorization: `Bearer ${localStorage.getItem('authToken')}`,
				},
				// body: {
				// 	companyId: companyId
				// }
			})
				.then(response => response.json())
				.then(data => {
					if (data.status === 'ready') {
						// Когда статус "ready", обновляем состояние и останавливаем интервал
						// dispatch(setCompanyId(data.companyId))
						dispatch(setQrAccess(true))
						clearInterval(statusCheckInterval) // Останавливаем запросы
					}
				})
				.catch(error => {
					console.error('Ошибка при получении статуса:', error)
				})
		}
	}

	/*inst add*/

	// Устанавливаем периодический запрос статуса каждые 30 секунд
	useEffect(() => {
		if (!qrAccess) {
			const interval = setInterval(() => {
				fetchWhatsAppStatus(userId)
			}, 5000) // Периодический запрос каждые 30 секунд

			setStatusCheckInterval(interval)

			// Очистка интервала при размонтировании компонента
			return () => clearInterval(interval)
		}
	}, [qrAccess, userId])

	function GetData() {
		const userId = localStorage.getItem('userId')

		if (!userId) {
			return
		}

		fetch(`${urlBack}/api/company/getData/${userId}`)
			.then(response => response.json())
			.then(data => {
				console.log('data getdata:', data)

				// Проверка на наличие названия компаний в data.companies
				if (
					data.userId === userId &&
					data.companies &&
					data.companies.length > 0
				) {
					// Проверяем, что каждая компания имеет название или другое обязательное поле
					const validCompanies = data.companies.filter(
						company => company.nameCompany
					)

					if (validCompanies.length > 0) {
						localStorage.setItem(
							`whatsappData-${userId}`,
							JSON.stringify(validCompanies)
						)
						// dispatch(setCompanyId(data._id))
						setSelectedCompanyId(data._id)
						dispatch(setSavedData(validCompanies))
						navigate('/Dashboard')

						console.log(validCompanies)
						console.log(selectedCompanyid)
					} else {
						console.log('Нет компаний с названием')
					}
				} else {
					localStorage.removeItem(`whatsappData-${userId}`)
					console.log('Данные не соответствуют или нет компаний')
				}
			})
			.catch(error => {
				console.error('Ошибка при получении данных с сервера:', error)
			})
	}

	useEffect(() => {
		const userId = localStorage.getItem('userId')
		const localDataRaw = localStorage.getItem(`whatsappData-${userId}`)

		if (localDataRaw) {
			try {
				const parsedData = JSON.parse(localDataRaw)

				if (Array.isArray(parsedData) && parsedData.length > 0) {
					const { nameCompany, managerResponse } = parsedData[0]

					if (nameCompany) {
						dispatch(setCompanyName(nameCompany))
					}

					if (typeof managerResponse === 'number') {
						dispatch(setResponseTime(managerResponse))
					}
				}
			} catch (e) {
				console.error('Ошибка при разборе localStorage whatsappData:', e)
			}
		}
	}, [dispatch])

	/*inst add*/

	useEffect(() => {
		const hasReloaded = sessionStorage.getItem('dashboardReloaded')

		if (!hasReloaded) {
			sessionStorage.setItem('dashboardReloaded', 'true')
			window.location.reload()
		}

		if (!userId) {
			return
		} else {
			GetData()
		}
	}, [])

	useEffect(() => {
		const saved = localStorage.getItem(`whatsappData-${userId}`)
		if (saved) {
			try {
				const parsed = JSON.parse(saved)
				dispatch(setSavedData(parsed))
			} catch (e) {
				console.error('Ошибка при парсинге localStorage:', e)
			}
		}
	}, [dispatch, userId])

		useEffect(() => {
					console.log(qrAccess);

	if (qrAccess && step === 1) {
		setStep(2)
		console.log(qrAccess);
	}
	}, [qrAccess])


	const isRangeF = useMediaQuery({ minWidth: 990, maxWidth: 1500 })
	const smallRange = useMediaQuery({ minWidth: 576, maxWidth: 1700 })
	const middleRange = useMediaQuery({ minWidth: 765, maxWidth: 1700 })

	let hasComapny = localStorage.getItem(`whatsappData-${userId}`)
	console.log('hascomany:', hasComapny)

	const [isMobile, setIsMobile] = useState(false);

	useEffect(() => {
		const checkScreen = () => setIsMobile(window.innerWidth < 768);
		checkScreen();
		window.addEventListener('resize', checkScreen);
		return () => window.removeEventListener('resize', checkScreen);
	}, []);


	const CustomLeftArrow = ({ onClick }) => {
		return (
			<button
				className="carousel-custom-arrow carousel-custom-arrow--left"
				onClick={onClick}
				aria-label="Previous Slide"
			>
				&lt;
			</button>
		);
	};

	const CustomRightArrow = ({ onClick }) => {
		return (
			<button
				className="carousel-custom-arrow carousel-custom-arrow--right"
				onClick={onClick}
				aria-label="Next Slide"
			>
				&gt;
			</button>
		);
	};

	const generateCode = async (storeId) => {
		try {
			setIsVerificationLoading(true);
			const response = await fetch(`${urlBack}/api/telegram/generate-code`, {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					Authorization: `Bearer ${localStorage.getItem('authToken')}`,
				},
				body: JSON.stringify({ storeId }),
			});
	
			const data = await response.json();
			
			if (data.success) {
				setVerificationCode(data.code.toString());
				message.success('Код верификации успешно сгенерирован');
			} else {
				message.error(data.message || 'Ошибка при генерации кода');
			}
		} catch (error) {
			console.error('Error generating code:', error);
			message.error('Ошибка при генерации кода');
		} finally {
			setIsVerificationLoading(false);
		}
	};
	
	
	<style>
	{`
	  .verification-steps {
		margin-top: 20px;
		padding: 20px;
		background: #f5f5f5;
		border-radius: 8px;
	  }
	
	  .verification-steps p {
		margin: 10px 0;
		font-size: 14px;
	  }
	
	  .verification-code {
		margin-top: 15px;
		padding: 15px;
		background: white;
		border-radius: 4px;
		border: 1px solid #d9d9d9;
	  }
	
	  .verification-code p {
		margin: 8px 0;
		color: #666;
	  }
	`}
	</style>


	const content = (
	<>
		<div className='undeMain'>
			<Text className='titleTextMain'>
				Уведомление о просроченном ответе
			</Text>

			<img src={img1} alt='Напоминание' className='imgForMain' />
			<Text className='seconUmderMain'>Контроль всех заявок</Text>
			<Text className='underTextMain'>
				SalesTrack следит, чтобы ни одно обращение не осталось без
				ответа.
			</Text>
		</div>
		<div className='undeMain'>
			<Text className='titleTextMain'>
				Чаты с незавершёнными сделками:
			</Text>
			<img src={img2} alt='Напоминание' className='imgForMain' />

			<Text className='seconUmderMain'>Напоминания о клиентах</Text>
			<Text className='underTextMain'>
				Автоматические напоминания, если клиенту не ответили вовремя.
			</Text>
		</div>
		<div className='undeMain'>
			<Text
				style={{
					display: 'inline-block',
				}}
				className='titleTextMain'
			>
				Ежедневный отчёт по диалогам:
			</Text>

			<img src={img3} alt='Напоминание' className='imgForMain' />
			<Text className='seconUmderMain'>Анализ работы менеджеров</Text>
			<Text className='underTextMain'>
				Вы видите, как каждый менеджер взаимодействует с клиентами.
			</Text>
		</div>
	</>
	)


	return (
		<>
			<HeaderMain />
			<div
				style={{
					minHeight: '90vh',
					alignContent: 'center',
					justifyContent: 'center',
					flexWrap: 'wrap',
					width: '100%',
				}}
			>
				<Row justify='center'>
					<Col
						xs={20}
						sm={smallRange ? 20 : 20}
						md={middleRange ? 18 : 8}
						lg={isRangeF ? 14 : 11}
						span={6}
						style={{ display: 'flex', flexDirection: 'column' }}
						className='infoBlock'
					>
						<Title className='titleMain' level={2}>
							Добро пожаловать в SalesTrack!
						</Title>
						<Text
							style={{
								marginTop: '20px',
								fontSize: '16px',
								textAlign: 'center',
								marginBottom: '20px',
							}}
							className='mainTextAfterTitle'
						>
							SalesTrack — это сервис, который контролирует работу ваших
							менеджеров в мессенджерах и помогает не терять ни одной заявки.
						</Text>

						{isMobile ? (
							<Carousel
								responsive={responsive}
								showDots={true}
								ssr={true}
								infinite={true}
								autoPlay={false}
								keyBoardControl={true}
								customTransition="all .5s ease-in-out"
								transitionDuration={500}
								containerClass="carousel-container"
								dotListClass="custom-dot-list-style"
								itemClass="carousel-item-padding-40-px"
								partialVisbile={false}
								customLeftArrow={<CustomLeftArrow />}
								customRightArrow={<CustomRightArrow />}
							>
							{content.props.children}
							</Carousel>
						) : (
							<div className="divForMobile">{content}</div>
						)}

						<>
							<div className='cards'>
								<div style={{ flex: 1, marginTop: '40px' }}>
									{savedData.map(data => (
										<div key={data._id} className='blockForMessanger'>
											<Card
												className='myCustomClass'
												onClick={async () => {
													setSelectedCompanyId(data._id);
													dispatch(setCompanyName(data.nameCompany || ''));
													dispatch(setResponseTime(data.managerResponse || 5));
													dispatch(setCompanyId(data._id));
													if (data.working_hours_start && data.working_hours_end) {
														setTimeRange([
															moment(data.working_hours_start, 'HH:mm'),
															moment(data.working_hours_end, 'HH:mm')
														]);
													} else {
														setTimeRange(null);
													}
													// Получаем URL для компании сразу при клике
													await GetLinkTelegramm(data._id);
													setisModalSettingWhatsapp(true);
												}}
												title={
													<span
														style={{
															display: 'flex',
															alignItems: 'center',
														}}
													>
														<WhatsAppOutlined
															style={{
																fontSize: '20px',
																color: '#25D366',
																marginRight: 8,
															}}
														/>
														{data.nameCompany}
													</span>
												}
											>
												<Text style={{ display: 'block' }}>
													Время ответа менеджера: {data.managerResponse}м <br />
													Номер телефона:{' '}
													<span
														style={{
															color: data.whatsappAuthorized
																? '#25D366'
																: 'red',
														}}
													>
														+{data.phoneNumber}
													</span>
													<br />
													Время работы:{' '}
													{data.working_hours_start && data.working_hours_end ? (
														<>
															<span style={{ color: 'black' }}>с </span>
															<span style={{ color: '#1677ff' }}>{data.working_hours_start}</span>
															<span style={{ color: 'black' }}> до </span>
															<span style={{ color: '#1677ff' }}>{data.working_hours_end}</span>
														</>
													) : (
														<span style={{ color: 'gray' }}>Не указано</span>
													)}
												</Text>
											</Card>
										</div>
									))}
								</div>

								<div style={{ flex: 1, marginTop: '40px', position: 'sticky', top: '20px' }}>
									<Card className='myCustomClass' title={
										<span
											style={{
												display: 'flex',
												alignItems: 'center',
												gap: '5px'
											}}
										>
											<FaTelegramPlane style={{ fontSize: 20, color: '#0088cc' }} />
											QR-код для Telegram
										</span>} style={{ textAlign: 'center' }}>

										{savedData.map(data => {
											const companyTelegramUrl = companyUrls[data._id];
											const isLoading = loadingUrls[data._id];
											
											return (
												<div key={`qr-${data._id}`}>
													{companyTelegramUrl ? (
														<>
														<div style={{display: 'flex'}}>
															<div style={{width: '130px', height: '130px'}}>
															<QRCodeSVG 
																value={companyTelegramUrl} 
																size={130}
																level="H"
															/>
															</div>
															<div style={{display: 'flex', flexDirection: 'column', justifyContent: 'center'}}>
																<Text style={{ fontSize: '12px', display: 'block', marginBottom: '8px' }}>
																	{data.nameCompany}
																</Text>
																<Link 
																	href={companyTelegramUrl} 
																	target="_blank" 
																	style={{ 
																		fontSize: '12px', 
																		display: 'block',
																		marginTop: '8px'
																	}}
																>
																	Открыть в Telegram
																</Link>
															</div>
														</div>
														</>
													) : (
														<>
														<Button
															type="primary"
															size="small"
															loading={isLoading}
															onClick={() => GetLinkTelegramm(data._id)}
															 style={{marginTop: '25px'}}
														>
															Сгенерировать QR-код
														</Button>
														
														<div className="verification-steps">
															<p>1. Нажмите кнопку для генерации кода верификации</p>
															<Button 
															type="primary" 
															onClick={() => generateCode(data._id)} 
															loading={isVerificationLoading}
															>
															Сгенерировать код
															</Button>

															{verificationCode && (
															<div className="verification-code">
																<p>2. Ваш код верификации:</p>
																<Input 
																value={verificationCode} 
																readOnly 
																suffix={
																	<Button 
																	type="link" 
																	onClick={() => {
																		navigator.clipboard.writeText(verificationCode);
																		message.success('Код скопирован в буфер обмена');
																	}}
																	>
																	Копировать
																	</Button>
																}
																/>
																<p>3. Создайте группу в Telegram и добавьте бота</p>
																<p>4. Отправьте код в группу</p>
																<p>5. Бот автоматически привяжет группу к вашему магазину</p>
															</div>
															  )}
      													</div>
														</>
													)}
												</div>
											);
										})}
									</Card>
								</div>

								<div style={{ flex: 1 }}>
									{savedDataInst.map((data, index) => (
										<div key={data._id} className='blockForMessanger'>
											<Card
												onClick={() => {
													dispatch(setCompanyIdInst(data._id))
													setisModalSettingInst(true)
												}}
												className='myCustomClass'
												title={
													<span
														style={{ display: 'flex', alignItems: 'center' }}
													>
														<InstagramOutlined
															style={{
																fontSize: '20px',
																color: '#E1306C',
																marginRight: 8,
															}}
														/>
														{data.nameCompany}
													</span>
												}
											>
												<Text style={{ display: 'block' }}>
													Время ответа менеджера: {data.managerResponse}м <br />
													Номер телефона:{' '}
													<span
														style={{
															color: data.whatsappAuthorized
																? '#25D366'
																: 'red',
														}}
													>
														+{data.phoneNumber}
													</span>
													<br />
												</Text>
											</Card>
										</div>
									))}
								</div>
							</div>

							{/* Настройка компаний whatsapp */}

							<Modal
								// title={`Настройка компаний: ${companyName}`}
								// width={1400}
								open={isModalSettingWhatsapp}
								onCancel={() => setisModalSettingWhatsapp(false)}
								footer={null}
								centered
							>
								<>
									<div style={{ display: 'flex', flexDirection: 'column' }}>
										<Title level={4} style={{ marginBottom: 8 }}>
											Настройка аккаунта компании
										</Title>

										<Text
											rules={[
												{
													required: true,
													message: 'Введите название компании',
												},
											]}
											style={{ display: 'block' }}
										>
											<span style={{ color: 'red' }}>* </span>Название компании
										</Text>
										<Input
											value={companyName}
											style={{
												width: '100%',
											}}
											onChange={e => dispatch(setCompanyName(e.target.value))}
											placeholder='Название компании'
										/>

										<div
											style={{
												display: 'flex',
												flexDirection: 'row',
												marginTop: '10px',
												alignItems: 'center',
												gap: '10px',
											}}
										>
											<ClockCircleOutlined
												style={{
													fontSize: 20,
													color: '#1677ff',
												}}
											/>
											<Text>Время ответа менеджера:</Text>
											<Slider
												min={0}
												max={30}
												value={responseTime}
												onChange={handleSliderChange}
												style={{ width: 120 }}
											/>

											<Text>{responseTime} минут</Text>
										</div>

										<div>
											<Title style={{
													fontSize: '15px'
												}}>
												Для подключения системы нажмите на ссылку {"->"} {' '}
												<a
													href={urlTelegram}
													target='_blank'
													rel='noopener noreferrer'
												>
													<b>Telegram</b>
												</a>
											</Title> <br/>


											<Title style={{ fontSize: '14px' }}>
												Для корректной работы системы, укажите время начала и конца рабочего дня
											</Title>

											<Space direction='vertical' size='middle'>
												<RangePicker
													style={{ width: '300px' }}
													placeholder={['Начало работы', 'Конец работы']}
													value={timeRange}
													format='HH:mm'
													onChange={times => setTimeRange(times)}
												/>
											</Space>
										</div>

										<div style={{ marginTop: 24 }}>
											<Button
												style={{ marginRight: 10 }}
												type='primary'
												onClick={changeWhatsApp}
											>
												Сохранить
											</Button>
											<Button danger onClick={deleteData}>
												Удалить
											</Button>
										</div>
									</div>
								</>
							</Modal>

							{/* Настройка компаний inst */}

							<Modal
								width={1400}
								open={isModalSettingInst}
								onCancel={() => setisModalSettingInst(false)}
								footer={null}
								centered
							>
								<>
									<div
										style={{
											display: 'flex',
											flexDirection: 'row',
											alignItems: 'center',
											flexWrap: 'wrap',
											gap: '100px',
											justifyContent: 'space-around',
										}}
									>
										<div style={{ width: '700px' }}>
											<Paragraph
												style={{ fontSize: '16px', textAlign: 'left' }}
											>
												Вы находитесь в аккаунте вашей компании. Здесь
												отображаются все подключенные каналы (WhatsApp,
												Instagram и т.д.).
												<br />
												<br />
												Внутри вы найдете ссылку на{' '}
												<strong>Telegram-бота</strong> — он будет присылать
												важные уведомления:
												<ul style={{ textAlign: 'left', marginLeft: '16px' }}>
													<li>если менеджер не ответил вовремя,</li>
													<li>если нужно дожать клиента и закрыть сделку.</li>
												</ul>
												Обязательно нажмите на ссылку и добавьте всех, кто
												участвует в продажах: владельца, РОПа, менеджеров,
												маркетолога или таргетолога.
												<br />
												<br />
												Это поможет вам повысить эффективность команды и
												увеличить прибыль компании.
											</Paragraph>
											<Text style={{ fontSize: '20px', display: 'block' }}>
												Введите название компании
											</Text>
											<Input
												value={companyNameInst}
												style={{
													width: '100%',
												}}
												onChange={e =>
													dispatch(setCompanyNameInst(e.target.value))
												}
												placeholder='Название компании'
											/>

											<Text style={{ fontSize: '20px', display: 'block' }}>
												Время ответа менеджера
											</Text>
											<Slider
												min={0}
												max={30}
												value={responseTimeInst}
												onChange={handleSliderChangeInst}
												style={{ width: '100%' }}
											/>
											<div
												style={{
													display: 'flex',
													alignItems: 'center',
													gap: '5px',
												}}
											>
												<InputNumber
													min={0}
													max={30}
													value={responseTimeInst}
													onChange={handleSliderChangeInst}
													style={{ width: '60px' }}
												/>
												<Text style={{ fontSize: '16px' }}>минут</Text>
											</div>
											<div
												style={{
													display: 'flex',
													flexDirection: 'column',
													width: '100%',
												}}
											>
												<Button
													className='saveBtn'
													type='primary'
													onClick={changeInst}
												>
													Сохранить
												</Button>
												<Button
													className='deleteBtn'
													type='primary'
													onClick={deleteDataInst}
												>
													Удалить
												</Button>
											</div>
										</div>

										<div
											style={{
												display: 'flex',
												flexDirection: 'column',
												alignItems: 'center',
											}}
										>
											<Card style={{ padding: 20, textAlign: 'center' }}>
												<Text style={{ fontSize: '20px', display: 'block' }}>
													Подключение активно
												</Text>
											</Card>
											<Text style={{ fontSize: '20px', marginTop: 10 }}>
												Ссылка на
												<Link href={urlTelegram} style={{ fontSize: '20px' }}>
													{' '}
													Telegram
												</Link>{' '}
												канал
											</Text>
										</div>
									</div>
								</>
							</Modal>

							<Text
								className='chooseMeneger'
								style={{ fontSize: '18px', marginTop: '40px' }}
								strong={true}
							>
								Выберите мессенджер, в который чаще всего приходят заявки:
							</Text>
						</>
					</Col>
				</Row>
				<Row justify={'center'} align={'middle'}>
					<Col
						xs={20}
						sm={smallRange ? 18 : 14}
						md={middleRange ? 14 : 8}
						lg={isRangeF ? 8 : 13}
						span={4}
						className='divBLOCK'
					>
						{/* <Link to='/whatsapp'>
							<Card className='cardAddWhatsApp' title='Добавить whatsapp'>
								<WhatsAppOutlined
									style={{ fontSize: '25px', color: '#25D366' }}
								/>
							</Card>
						</Link> */}

						<Button
							size='large'
							className='cardAddWhatsApp'
							onClick={showModal}
							type='primary'
							icon={<WhatsAppOutlined style={{ fontSize: '24px' }} />}
						>
							WhatsApp
						</Button>

						{
							// userId === "683823dab7167bcd3347b71a" && (
							// 	<>
							// 		<Button
							// 			size='large'
							// 			className='cardAddInst'
							// 			type='primary'
							// 			onClick={showModalInst}
							// 			icon={<InstagramOutlined style={{ fontSize: '24px' }} />}
							// 		>
							// 			Instagram
							// 		</Button>
							// 	</>
							// )
						}

						{/* Создание компании whatsapp */}

						<Modal
							open={isModalOpen}
							footer={null}
							onCancel={() => setIsModalOpen(false)}
							centered
							width={600}
						>
							<>
								{step === 1 && (
  <div
	style={{
	  display: 'flex',
	  width: '100%',
	  gap: '20px',
	  flexWrap: 'wrap',
	}}
  >
	<div style={{ flex: '1 1 300px' }}>
	  <Title style={{ fontSize: "15px" }} level={2}>Шаг 1/4</Title>
	  <Title style={{ fontSize: '20px' }}>Подключите ваш WhatsApp</Title>
	  <br />
	  <Paragraph style={{ fontSize: '14px', textAlign: 'left' }}>
		Отсканируйте QR-код с того WhatsApp-аккаунта, куда обычно пишут ваши клиенты.
		Мы будем отслеживать заявки и напоминать менеджерам отвечать вовремя.
	  </Paragraph>
	  <Paragraph style={{ fontSize: '14px', textAlign: 'left' }}>
		<Text strong>Важно:</Text> Проверьте, сколько устройств уже подключено к WhatsApp —
		максимум 4 устройства. Если список заполнен — отключите одно из старых устройств.
	  </Paragraph>
	  <Paragraph style={{ fontSize: '14px', textAlign: 'left' }}>
		Это займет не больше минуты!
	  </Paragraph>
	</div>

	<div
	  style={{
		flex: '1 1 300px',
		display: 'flex',
		justifyContent: 'center',
		alignItems: 'center',
	  }}
	>
	  <Card style={{ padding: 20, textAlign: 'center' }}>
		{qrCode ? (
		  <img src={qrCode} style={{ width: 200, height: 200 }} />
		) : (
		  <Spin indicator={<LoadingOutlined spin />} size='large' />
		)}
	  </Card>
	</div>
  </div>
)}

{step == 2 && qrAccess && (
  <div style={{ marginBottom: 24 }}>
	<Title style={{ fontSize: "15px" }} level={2}>Шаг 2/4</Title>
	<Title level={4} style={{ marginBottom: 8 }}>Настройка аккаунта компании</Title>

	<Text style={{ display: 'block' }}>
	  <span style={{ color: 'red' }}>* </span>Название компании
	</Text>
	<Input
	  value={companyName}
	  style={{ width: '100%' }}
	  onChange={e => dispatch(setCompanyName(e.target.value))}
	  placeholder='Название компании'
	/>

	<div style={{ marginTop: 16 }}>
	  <Button type='primary' onClick={() => setStep(3)}>
		Далее
	  </Button>
	</div>
  </div>
)}

{step === 3 && qrAccess && (
  <div style={{ marginTop: 24 }}>
	<Title style={{ fontSize: "15px" }} level={2}>Шаг 3/4</Title>
	<Title level={4} style={{ marginBottom: 8 }}>Укажите время, за которое менеджер должен ответить</Title>

	<div
	  style={{
		display: 'flex',
		flexDirection: 'row',
		marginTop: '10px',
		alignItems: 'center',
		gap: '10px',
	  }}
	>
	  <ClockCircleOutlined style={{ fontSize: 20, color: '#1677ff' }} />
	  <Text>Время ответа менеджера:</Text>
	  <Slider
		min={0}
		max={30}
		value={responseTime}
		onChange={handleSliderChange}
		style={{ width: 120 }}
	  />
	  <Text>{responseTime} минут</Text>
	</div>

	<div style={{ marginTop: 24 }}>
	  <Button style={{ marginRight: 8 }} onClick={() => setStep(2)}>
		Назад
	  </Button>
	  <Button type='primary' onClick={() => setStep(4)}>
		Далее
	  </Button>
	</div>
  </div>
)}
{step === 4 && qrAccess && (
  <div style={{ marginTop: 24 }}>
	<Title style={{ fontSize: "15px" }} level={2}>Шаг 4/4</Title>
	<Title level={4} style={{ marginBottom: 8 }}>Для корректной работы системы, укажите время начала и конца рабочего дня</Title>

											<Space direction='vertical' size='middle'>
												<RangePicker
													style={{ width: '300px' }}
													placeholder={['Начало работы', 'Конец работы']}
													value={timeRange}
													format='HH:mm'
													onChange={times => setTimeRange(times)}
												/>
											</Space>

	<div style={{ marginTop: 24 }}>
	  <Button style={{ marginRight: 8 }} onClick={() => setStep(4)}>
		Назад
	  </Button>
	  <Button type='primary' onClick={saveData}>
		Сохранить
	  </Button>
	</div>
  </div>
)}
</>
						</Modal>

						{/* Создание компаний Inst */}

						<Modal
							open={isModalOpenInst}
							footer={null}
							onCancel={() => setIsModalOpenInst(false)}
							centered
						>
							<>
								{qrAccessInst ? (
									<div style={{ marginBottom: 24 }}>
										<Space align='start'>
											<SoundOutlined
												style={{ fontSize: 22, color: '#1677ff', marginTop: 4 }}
											/>

												<Title style={{fontSize: "15px"}} level={2}>
													Шаг 2/5
												</Title>

										</Space>

										<Title level={4} style={{ marginBottom: 8 }}>
											Настройка аккаунта компании
										</Title>

										<Text
											rules={[
												{
													required: true,
													message: 'Введите название компании',
												},
											]}
											style={{ display: 'block' }}
										>
											<span style={{ color: 'red' }}>* </span>Название компании
										</Text>
										<Input
											value={companyNameInst}
											style={{
												width: '100%',
											}}
											onChange={e =>
												dispatch(setCompanyNameInst(e.target.value))
											}
											placeholder='Название компании'
										/>

										<div
											style={{
												display: 'flex',
												flexDirection: 'row',
												marginTop: '10px',
												alignItems: 'center',
												gap: '10px',
											}}
										>
											<ClockCircleOutlined
												style={{
													fontSize: 20,
													color: '#1677ff',
												}}
											/>
											<Text>Время ответа менеджера:</Text>
											<Slider
												min={0}
												max={30}
												value={responseTimeInst}
												onChange={handleSliderChangeInst}
												style={{ width: 120 }}
											/>

											<Text>{responseTime} минут</Text>
										</div>
											<div>
												<Button
													type='primary'
													style={{ marginRight: '10px' }}
													onClick={saveData}
												>
													Продолжить
												</Button>
											</div>
									</div>
								) : (
									<div
										style={{
											display: 'flex',
											width: '100%',
											gap: '20px',
											flexWrap: 'wrap',
										}}
									>
										<div style={{ flex: '1 1 300px' }}>
											<Title style={{ fontSize: '20px' }}>
												Подключите ваш Instagram
											</Title>
											<br />
											<Paragraph
												style={{ fontSize: '14px', textAlign: 'left' }}
											>
												Отсканируйте QR-код с того Instgram-аккаунта, куда
												обычно пишут ваши клиенты. Мы будем отслеживать заявки и
												напоминать менеджерам отвечать вовремя.
											</Paragraph>

											<Paragraph
												style={{ fontSize: '14px', textAlign: 'left' }}
											>
												<Text style={{ fontSize: '14px' }} strong>
													Важно:
												</Text>{' '}
												Проверьте, сколько устройств уже подключено к Instagram
												— максимум можно подключить до 4 устройств одновременно.
												Если список заполнен — просто отключите одно из старых
												устройств, чтобы подключить SalesTrack.
											</Paragraph>

											<Paragraph
												style={{ fontSize: '14px', textAlign: 'left' }}
											>
												Это займет не больше минуты!
											</Paragraph>

											<Button
												type='primary'
												style={{ backgroundColor: '#e1306c' }}
												disabled={isLoading}
												onClick={handleConnect}
											>
												{isLoading ? (
													<Spin
														indicator={<LoadingOutlined spin />}
														size='large'
													/>
												) : (
													'Подключить Instagram'
												)}
											</Button>
										</div>
									</div>
								)}
							</>
						</Modal>
					</Col>
				</Row>
			</div>
			<FooterMain></FooterMain>
		</>
	)
}


