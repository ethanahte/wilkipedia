// Hand-written translations of the site's own words (menus, headings, labels,
// buttons, the bell schedule), so they read like a person wrote them. Google
// Translate (translate.js) still handles everything else: mostly what students
// write. Anything translated here is marked translate="no" so Google leaves it.
//
// Columns follow CODES. To fix a word, edit its row; to add a phrase, add a
// row with all 15 languages (the self-check below skips rows of the wrong length).
// These were written for this site and should be checked by native speakers.

export const CODES = ['es', 'vi', 'zh-CN', 'zh-TW', 'ko', 'ja', 'tl', 'hi', 'pa', 'te', 'ta', 'ar', 'fa', 'ru', 'pt'];

export const LANGS = [
  ['en', 'English', 'English'], ['es', 'Español', 'Spanish'], ['vi', 'Tiếng Việt', 'Vietnamese'],
  ['zh-CN', '简体中文', 'Chinese (Simplified)'], ['zh-TW', '繁體中文', 'Chinese (Traditional)'], ['ko', '한국어', 'Korean'],
  ['ja', '日本語', 'Japanese'], ['tl', 'Tagalog', 'Filipino'], ['hi', 'हिन्दी', 'Hindi'], ['pa', 'ਪੰਜਾਬੀ', 'Punjabi'],
  ['te', 'తెలుగు', 'Telugu'], ['ta', 'தமிழ்', 'Tamil'], ['ar', 'العربية', 'Arabic'], ['fa', 'فارسی', 'Persian'],
  ['ru', 'Русский', 'Russian'], ['pt', 'Português', 'Portuguese'],
];

/* eslint-disable max-len */
const ROWS = {
  'Map': ['Mapa', 'Bản đồ', '地图', '地圖', '지도', '地図', 'Mapa', 'नक्शा', 'ਨਕਸ਼ਾ', 'మ్యాప్', 'வரைபடம்', 'الخريطة', 'نقشه', 'Карта', 'Mapa'],
  'Classes': ['Clases', 'Lớp học', '课程', '課程', '수업', '授業', 'Mga klase', 'कक्षाएँ', 'ਕਲਾਸਾਂ', 'తరగతులు', 'வகுப்புகள்', 'الفصول', 'کلاس‌ها', 'Предметы', 'Disciplinas'],
  'More': ['Más', 'Thêm', '更多', '更多', '더보기', 'その他', 'Iba pa', 'और', 'ਹੋਰ', 'మరిన్ని', 'மேலும்', 'المزيد', 'بیشتر', 'Ещё', 'Mais'],
  'Bell schedule': ['Horario de clases', 'Giờ vào lớp', '作息时间表', '作息時間表', '수업 시간표', '授業時間表', 'Iskedyul ng klase', 'घंटी की समय-सारणी', 'ਘੰਟੀ ਦੀ ਸਮਾਂ-ਸਾਰਣੀ', 'పీరియడ్ సమయాలు', 'பாடவேளை அட்டவணை', 'جدول الحصص', 'برنامه زنگ‌ها', 'Расписание звонков', 'Horário das aulas'],
  'Cafeteria menu': ['Menú de la cafetería', 'Thực đơn căng tin', '食堂菜单', '餐廳菜單', '급식 메뉴', 'カフェテリアのメニュー', 'Menu ng kantina', 'कैंटीन का मेन्यू', 'ਕੈਂਟੀਨ ਦਾ ਮੀਨੂ', 'క్యాంటీన్ మెనూ', 'உணவக மெனு', 'قائمة الكافتيريا', 'منوی غذاخوری', 'Меню столовой', 'Cardápio da cantina'],
  'Clubs': ['Clubes', 'Câu lạc bộ', '社团', '社團', '동아리', 'クラブ', 'Mga club', 'क्लब', 'ਕਲੱਬ', 'క్లబ్‌లు', 'கழகங்கள்', 'النوادي', 'باشگاه‌ها', 'Клубы', 'Clubes'],
  'Sports': ['Deportes', 'Thể thao', '体育', '體育', '스포츠', 'スポーツ', 'Palakasan', 'खेल', 'ਖੇਡਾਂ', 'క్రీడలు', 'விளையாட்டுகள்', 'الرياضة', 'ورزش', 'Спорт', 'Esportes'],
  'Summer homework': ['Tarea de verano', 'Bài tập hè', '暑假作业', '暑假作業', '여름방학 과제', '夏休みの宿題', 'Takdang-aralin sa tag-init', 'गर्मी की छुट्टियों का गृहकार्य', 'ਗਰਮੀਆਂ ਦਾ ਹੋਮਵਰਕ', 'వేసవి హోంవర్క్', 'கோடை வீட்டுப்பாடம்', 'واجبات الصيف', 'تکالیف تابستانی', 'Летнее задание', 'Tarefa de verão'],
  'School info': ['Información escolar', 'Thông tin trường', '学校信息', '學校資訊', '학교 정보', '学校情報', 'Impormasyon ng paaralan', 'स्कूल की जानकारी', 'ਸਕੂਲ ਦੀ ਜਾਣਕਾਰੀ', 'పాఠశాల సమాచారం', 'பள்ளித் தகவல்', 'معلومات المدرسة', 'اطلاعات مدرسه', 'О школе', 'Informações da escola'],
  'Leaderboard': ['Clasificación', 'Bảng xếp hạng', '排行榜', '排行榜', '순위표', 'ランキング', 'Leaderboard', 'लीडरबोर्ड', 'ਲੀਡਰਬੋਰਡ', 'లీడర్‌బోర్డ్', 'முன்னணிப் பட்டியல்', 'لوحة المتصدرين', 'جدول امتیازات', 'Рейтинг', 'Classificação'],
  'Teachers': ['Maestros', 'Giáo viên', '老师', '老師', '선생님', '先生', 'Mga guro', 'शिक्षक', 'ਅਧਿਆਪਕ', 'ఉపాధ్యాయులు', 'ஆசிரியர்கள்', 'المعلمون', 'معلمان', 'Учителя', 'Professores'],
  'Community rules': ['Reglas de la comunidad', 'Quy tắc cộng đồng', '社区规则', '社群規則', '커뮤니티 규칙', 'コミュニティのルール', 'Mga patakaran', 'समुदाय के नियम', 'ਭਾਈਚਾਰੇ ਦੇ ਨਿਯਮ', 'సంఘ నియమాలు', 'சமூக விதிகள்', 'قواعد المجتمع', 'قوانین جامعه', 'Правила сообщества', 'Regras da comunidade'],
  'About': ['Acerca de', 'Giới thiệu', '关于', '關於', '소개', 'このサイトについて', 'Tungkol dito', 'परिचय', 'ਜਾਣ-ਪਛਾਣ', 'గురించి', 'பற்றி', 'حول الموقع', 'درباره', 'О сайте', 'Sobre'],
  'Send feedback': ['Enviar comentarios', 'Gửi góp ý', '发送反馈', '傳送意見', '의견 보내기', 'ご意見を送る', 'Magpadala ng puna', 'सुझाव भेजें', 'ਸੁਝਾਅ ਭੇਜੋ', 'అభిప్రాయం పంపండి', 'கருத்து அனுப்பு', 'إرسال ملاحظات', 'ارسال بازخورد', 'Отправить отзыв', 'Enviar sugestão'],
  'Credits & thanks': ['Créditos y agradecimientos', 'Ghi công & lời cảm ơn', '致谢名单', '致謝名單', '만든 사람들', 'クレジットと謝辞', 'Pagkilala at pasasalamat', 'आभार', 'ਧੰਨਵਾਦ', 'కృతజ్ఞతలు', 'நன்றி', 'شكر وتقدير', 'قدردانی', 'Благодарности', 'Créditos e agradecimentos'],
  'Official Wilcox website': ['Sitio web oficial de Wilcox', 'Trang web chính thức của Wilcox', 'Wilcox 官方网站', 'Wilcox 官方網站', 'Wilcox 공식 웹사이트', 'Wilcox公式サイト', 'Opisyal na website ng Wilcox', 'Wilcox की आधिकारिक वेबसाइट', 'Wilcox ਦੀ ਅਧਿਕਾਰਤ ਵੈੱਬਸਾਈਟ', 'Wilcox అధికారిక వెబ్‌సైట్', 'Wilcox அதிகாரப்பூர்வ இணையதளம்', 'موقع Wilcox الرسمي', 'وب‌سایت رسمی Wilcox', 'Официальный сайт Wilcox', 'Site oficial da Wilcox'],
  'Sign in': ['Iniciar sesión', 'Đăng nhập', '登录', '登入', '로그인', 'ログイン', 'Mag-sign in', 'साइन इन करें', 'ਸਾਈਨ ਇਨ ਕਰੋ', 'సైన్ ఇన్', 'உள்நுழை', 'تسجيل الدخول', 'ورود', 'Войти', 'Entrar'],
  'Search': ['Buscar', 'Tìm kiếm', '搜索', '搜尋', '검색', '検索', 'Maghanap', 'खोजें', 'ਖੋਜੋ', 'వెతకండి', 'தேடு', 'بحث', 'جستجو', 'Поиск', 'Pesquisar'],
  'Search anything…': ['Busca lo que quieras…', 'Tìm bất cứ thứ gì…', '搜索任何内容…', '搜尋任何內容…', '무엇이든 검색…', '何でも検索…', 'Maghanap ng kahit ano…', 'कुछ भी खोजें…', 'ਕੁਝ ਵੀ ਖੋਜੋ…', 'ఏదైనా వెతకండి…', 'எதையும் தேடு…', 'ابحث عن أي شيء…', 'جستجوی هر چیز…', 'Искать…', 'Pesquise qualquer coisa…'],
  'Contribute': ['Contribuir', 'Đóng góp', '贡献内容', '貢獻內容', '기여하기', '投稿する', 'Mag-ambag', 'योगदान दें', 'ਯੋਗਦਾਨ ਪਾਓ', 'సహకరించండి', 'பங்களி', 'ساهِم', 'مشارکت', 'Внести вклад', 'Contribuir'],
  'Bounties': ['Misiones', 'Nhiệm vụ', '悬赏任务', '懸賞任務', '미션', '募集タスク', 'Mga bounty', 'इनामी काम', 'ਇਨਾਮੀ ਕੰਮ', 'బహుమతి పనులు', 'பரிசுப் பணிகள்', 'المهام', 'مأموریت‌ها', 'Задания', 'Missões'],
  'Browse by subject': ['Explorar por materia', 'Xem theo môn học', '按科目浏览', '依科目瀏覽', '과목별로 보기', '教科から探す', 'Tingnan ayon sa asignatura', 'विषय के अनुसार देखें', 'ਵਿਸ਼ੇ ਅਨੁਸਾਰ ਵੇਖੋ', 'సబ్జెక్టు వారీగా చూడండి', 'பாடவாரியாகப் பார்', 'تصفح حسب المادة', 'مرور بر اساس درس', 'По предметам', 'Navegar por matéria'],
  'Recently added': ['Añadido recientemente', 'Mới thêm gần đây', '最近添加', '最近新增', '최근 추가됨', '最近の追加', 'Bagong idinagdag', 'हाल ही में जोड़ा गया', 'ਹਾਲ ਹੀ ਵਿੱਚ ਜੋੜਿਆ', 'ఇటీవల జోడించినవి', 'சமீபத்தில் சேர்க்கப்பட்டவை', 'أُضيف مؤخرًا', 'تازه‌ها', 'Недавно добавлено', 'Adicionado recentemente'],
  'Campus map': ['Mapa del campus', 'Bản đồ trường', '校园地图', '校園地圖', '캠퍼스 지도', 'キャンパスマップ', 'Mapa ng kampus', 'कैंपस का नक्शा', 'ਕੈਂਪਸ ਦਾ ਨਕਸ਼ਾ', 'క్యాంపస్ మ్యాప్', 'வளாக வரைபடம்', 'خريطة المدرسة', 'نقشه مدرسه', 'Карта школы', 'Mapa do campus'],
  'Full schedule': ['Horario completo', 'Xem đầy đủ', '完整时间表', '完整時間表', '전체 시간표', '全体を見る', 'Buong iskedyul', 'पूरी समय-सारणी', 'ਪੂਰੀ ਸਮਾਂ-ਸਾਰਣੀ', 'పూర్తి షెడ్యూల్', 'முழு அட்டவணை', 'الجدول الكامل', 'برنامه کامل', 'Всё расписание', 'Horário completo'],
  'Hide': ['Ocultar', 'Ẩn', '收起', '收起', '숨기기', '閉じる', 'Itago', 'छिपाएँ', 'ਲੁਕਾਓ', 'దాచు', 'மறை', 'إخفاء', 'بستن', 'Скрыть', 'Ocultar'],
  'Lunch': ['Almuerzo', 'Giờ ăn trưa', '午餐', '午餐', '점심시간', '昼休み', 'Tanghalian', 'लंच', 'ਲੰਚ', 'మధ్యాహ్న భోజనం', 'மதிய உணவு', 'الغداء', 'ناهار', 'Обед', 'Almoço'],
  'Breakfast': ['Desayuno', 'Bữa sáng', '早餐', '早餐', '아침', '朝食', 'Almusal', 'नाश्ता', 'ਨਾਸ਼ਤਾ', 'అల్పాహారం', 'காலை உணவு', 'الفطور', 'صبحانه', 'Завтрак', 'Café da manhã'],
  'Brunch': ['Merienda', 'Giờ ăn nhẹ', '课间餐', '課間餐', '간식 시간', '軽食休憩', 'Merienda', 'नाश्ते का ब्रेक', 'ਨਾਸ਼ਤੇ ਦੀ ਛੁੱਟੀ', 'చిరుతిండి విరామం', 'சிற்றுண்டி இடைவேளை', 'استراحة خفيفة', 'میان‌وعده', 'Перекус', 'Lanche'],
  'Passing period': ['Cambio de clase', 'Giờ chuyển lớp', '课间', '下課時間', '쉬는 시간', '移動時間', 'Oras ng paglipat', 'कक्षा बदलने का समय', 'ਕਲਾਸ ਬਦਲਣ ਦਾ ਸਮਾਂ', 'తరగతి మార్పు', 'வகுப்பு மாற்றம்', 'وقت الانتقال', 'زمان جابه‌جایی', 'Перемена', 'Troca de sala'],
  'School starts': ['Las clases empiezan', 'Vào học lúc', '上课时间', '上課時間', '수업 시작', '始業', 'Simula ng klase', 'स्कूल शुरू', 'ਸਕੂਲ ਸ਼ੁਰੂ', 'పాఠశాల ప్రారంభం', 'பள்ளி தொடக்கம்', 'يبدأ الدوام', 'شروع مدرسه', 'Начало уроков', 'As aulas começam'],
  'School’s out.': ['Terminaron las clases.', 'Đã tan học.', '已放学。', '已放學。', '수업이 끝났어요.', '放課後です。', 'Tapos na ang klase.', 'छुट्टी हो गई।', 'ਛੁੱਟੀ ਹੋ ਗਈ।', 'బడి ముగిసింది.', 'பள்ளி முடிந்தது.', 'انتهى الدوام.', 'مدرسه تمام شد.', 'Уроки закончились.', 'As aulas acabaram.'],
  'No school': ['No hay clases', 'Nghỉ học', '不上课', '不上課', '휴교일', '休校', 'Walang pasok', 'स्कूल बंद', 'ਸਕੂਲ ਬੰਦ', 'సెలవు', 'பள்ளி விடுமுறை', 'لا دوام', 'تعطیل', 'Уроков нет', 'Sem aula'],
  'Today': ['Hoy', 'Hôm nay', '今天', '今天', '오늘', '今日', 'Ngayon', 'आज', 'ਅੱਜ', 'ఈరోజు', 'இன்று', 'اليوم', 'امروز', 'Сегодня', 'Hoje'],
  'This week': ['Esta semana', 'Tuần này', '本周', '本週', '이번 주', '今週', 'Ngayong linggo', 'इस हफ़्ते', 'ਇਸ ਹਫ਼ਤੇ', 'ఈ వారం', 'இந்த வாரம்', 'هذا الأسبوع', 'این هفته', 'Эта неделя', 'Esta semana'],
  'Monday': ['Lunes', 'Thứ Hai', '星期一', '星期一', '월요일', '月曜日', 'Lunes', 'सोमवार', 'ਸੋਮਵਾਰ', 'సోమవారం', 'திங்கள்', 'الاثنين', 'دوشنبه', 'Понедельник', 'Segunda-feira'],
  'Tuesday': ['Martes', 'Thứ Ba', '星期二', '星期二', '화요일', '火曜日', 'Martes', 'मंगलवार', 'ਮੰਗਲਵਾਰ', 'మంగళవారం', 'செவ்வாய்', 'الثلاثاء', 'سه‌شنبه', 'Вторник', 'Terça-feira'],
  'Wednesday': ['Miércoles', 'Thứ Tư', '星期三', '星期三', '수요일', '水曜日', 'Miyerkules', 'बुधवार', 'ਬੁੱਧਵਾਰ', 'బుధవారం', 'புதன்', 'الأربعاء', 'چهارشنبه', 'Среда', 'Quarta-feira'],
  'Thursday': ['Jueves', 'Thứ Năm', '星期四', '星期四', '목요일', '木曜日', 'Huwebes', 'गुरुवार', 'ਵੀਰਵਾਰ', 'గురువారం', 'வியாழன்', 'الخميس', 'پنج‌شنبه', 'Четверг', 'Quinta-feira'],
  'Friday': ['Viernes', 'Thứ Sáu', '星期五', '星期五', '금요일', '金曜日', 'Biyernes', 'शुक्रवार', 'ਸ਼ੁੱਕਰਵਾਰ', 'శుక్రవారం', 'வெள்ளி', 'الجمعة', 'جمعه', 'Пятница', 'Sexta-feira'],
  'Saturday': ['Sábado', 'Thứ Bảy', '星期六', '星期六', '토요일', '土曜日', 'Sabado', 'शनिवार', 'ਸ਼ਨੀਵਾਰ', 'శనివారం', 'சனி', 'السبت', 'شنبه', 'Суббота', 'Sábado'],
  'Sunday': ['Domingo', 'Chủ Nhật', '星期日', '星期日', '일요일', '日曜日', 'Linggo', 'रविवार', 'ਐਤਵਾਰ', 'ఆదివారం', 'ஞாயிறு', 'الأحد', 'یکشنبه', 'Воскресенье', 'Domingo'],
  'What students say': ['Lo que dicen los estudiantes', 'Học sinh nói gì', '同学们怎么说', '同學們怎麼說', '학생들의 후기', '生徒の声', 'Sabi ng mga estudyante', 'छात्र क्या कहते हैं', 'ਵਿਦਿਆਰਥੀ ਕੀ ਕਹਿੰਦੇ ਹਨ', 'విద్యార్థులు ఏమంటున్నారు', 'மாணவர்கள் சொல்வது', 'آراء الطلاب', 'نظر دانش‌آموزان', 'Что говорят ученики', 'O que dizem os alunos'],
  'Resources & study guides': ['Recursos y guías de estudio', 'Tài liệu & đề cương ôn tập', '学习资源与复习资料', '學習資源與複習資料', '자료 및 학습 가이드', '教材と学習ガイド', 'Mga sanggunian at gabay', 'संसाधन और स्टडी गाइड', 'ਸਰੋਤ ਅਤੇ ਸਟੱਡੀ ਗਾਈਡ', 'వనరులు & స్టడీ గైడ్‌లు', 'வளங்கள் & படிப்பு வழிகாட்டிகள்', 'موارد وأدلة دراسية', 'منابع و راهنمای مطالعه', 'Материалы и конспекты', 'Recursos e guias de estudo'],
  'Tips from past students': ['Consejos de exalumnos', 'Lời khuyên từ khóa trước', '学长学姐的建议', '學長姐的建議', '선배들의 팁', '先輩からのアドバイス', 'Tip mula sa dating estudyante', 'पुराने छात्रों के सुझाव', 'ਪੁਰਾਣੇ ਵਿਦਿਆਰਥੀਆਂ ਦੇ ਸੁਝਾਅ', 'పూర్వ విద్యార్థుల చిట్కాలు', 'முன்னாள் மாணவர்களின் குறிப்புகள்', 'نصائح من طلاب سابقين', 'نکته‌هایی از دانش‌آموزان قبلی', 'Советы от выпускников', 'Dicas de ex-alunos'],
  'Comments': ['Comentarios', 'Bình luận', '评论', '留言', '댓글', 'コメント', 'Mga komento', 'टिप्पणियाँ', 'ਟਿੱਪਣੀਆਂ', 'వ్యాఖ్యలు', 'கருத்துகள்', 'التعليقات', 'نظرها', 'Комментарии', 'Comentários'],
  'Catalog description': ['Descripción del catálogo', 'Mô tả môn học', '课程说明', '課程說明', '과목 설명', '科目の説明', 'Paglalarawan sa katalogo', 'कोर्स का विवरण', 'ਕੋਰਸ ਦਾ ਵੇਰਵਾ', 'కోర్సు వివరణ', 'பாட விளக்கம்', 'وصف المادة', 'توضیحات درس', 'Описание курса', 'Descrição da disciplina'],
  'Grades': ['Grados', 'Khối lớp', '年级', '年級', '학년', '学年', 'Baitang', 'कक्षाएँ', 'ਜਮਾਤਾਂ', 'తరగతులు', 'வகுப்புகள்', 'الصفوف', 'پایه', 'Классы', 'Séries'],
  'Credits': ['Créditos', 'Tín chỉ', '学分', '學分', '학점', '単位', 'Credits', 'क्रेडिट', 'ਕ੍ਰੈਡਿਟ', 'క్రెడిట్లు', 'மதிப்புப் புள்ளிகள்', 'الساعات المعتمدة', 'واحد', 'Кредиты', 'Créditos'],
  'Prerequisite': ['Requisito previo', 'Điều kiện tiên quyết', '先修要求', '先修要求', '선수 과목', '履修条件', 'Kinakailangan muna', 'पूर्व-आवश्यकता', 'ਪਹਿਲਾਂ ਦੀ ਲੋੜ', 'ముందస్తు అర్హత', 'முன்தேவை', 'المتطلب السابق', 'پیش‌نیاز', 'Требования', 'Pré-requisito'],
  'Overview': ['Resumen', 'Tổng quan', '概述', '概述', '개요', '概要', 'Buod', 'सारांश', 'ਸਾਰ', 'అవలోకనం', 'கண்ணோட்டம்', 'نظرة عامة', 'نمای کلی', 'Обзор', 'Visão geral'],
  'Tips': ['Consejos', 'Mẹo', '建议', '建議', '팁', 'ヒント', 'Mga tip', 'सुझाव', 'ਸੁਝਾਅ', 'చిట్కాలు', 'குறிப்புகள்', 'نصائح', 'نکته‌ها', 'Советы', 'Dicas'],
  'Resources': ['Recursos', 'Tài liệu', '资源', '資源', '자료', '教材', 'Mga sanggunian', 'संसाधन', 'ਸਰੋਤ', 'వనరులు', 'வளங்கள்', 'الموارد', 'منابع', 'Материалы', 'Recursos'],
  'Summer HW': ['Tarea de verano', 'Bài tập hè', '暑假作业', '暑假作業', '여름 과제', '夏の宿題', 'Tag-init na aralin', 'गर्मी का काम', 'ਗਰਮੀਆਂ ਦਾ ਕੰਮ', 'వేసవి పని', 'கோடைப் பணி', 'واجب الصيف', 'تکلیف تابستانی', 'Летнее задание', 'Tarefa de verão'],
  'Catalog': ['Catálogo', 'Mô tả', '说明', '說明', '설명', '説明', 'Katalogo', 'विवरण', 'ਵੇਰਵਾ', 'వివరణ', 'விளக்கம்', 'الوصف', 'توضیحات', 'Описание', 'Descrição'],
  'Time outside class': ['Tiempo fuera de clase', 'Thời gian tự học', '课外用时', '課外用時', '수업 외 학습 시간', '授業外の学習時間', 'Oras sa labas ng klase', 'कक्षा के बाहर का समय', 'ਕਲਾਸ ਤੋਂ ਬਾਹਰ ਸਮਾਂ', 'తరగతి వెలుపల సమయం', 'வகுப்புக்கு வெளியே நேரம்', 'الوقت خارج الحصة', 'زمان خارج از کلاس', 'Время вне урока', 'Tempo fora da aula'],
  'Difficulty': ['Dificultad', 'Độ khó', '难度', '難度', '난이도', '難易度', 'Hirap', 'कठिनाई', 'ਮੁਸ਼ਕਲ', 'కఠినత్వం', 'சிரமம்', 'الصعوبة', 'سختی', 'Сложность', 'Dificuldade'],
  'AP exam': ['Examen AP', 'Kỳ thi AP', 'AP 考试', 'AP 考試', 'AP 시험', 'AP試験', 'AP exam', 'AP परीक्षा', 'AP ਪ੍ਰੀਖਿਆ', 'AP పరీక్ష', 'AP தேர்வு', 'اختبار AP', 'آزمون AP', 'Экзамен AP', 'Exame AP'],
  'Test style': ['Tipo de exámenes', 'Kiểu bài kiểm tra', '考试形式', '考試形式', '시험 유형', 'テストの形式', 'Uri ng pagsusulit', 'परीक्षा का तरीका', 'ਟੈਸਟ ਦੀ ਕਿਸਮ', 'పరీక్ష విధానం', 'தேர்வு முறை', 'نمط الاختبارات', 'نوع آزمون‌ها', 'Формат тестов', 'Formato das provas'],
  'Grading policy': ['Cómo se califica', 'Cách chấm điểm', '评分方式', '評分方式', '평가 기준', '成績の付け方', 'Paano nagmamarka', 'ग्रेडिंग का तरीका', 'ਗ੍ਰੇਡਿੰਗ ਦਾ ਤਰੀਕਾ', 'గ్రేడింగ్ విధానం', 'மதிப்பெண் முறை', 'طريقة التقييم', 'روش نمره‌دهی', 'Система оценок', 'Critérios de avaliação'],
  'Homework style and load': ['Tipo y cantidad de tarea', 'Kiểu và lượng bài tập', '作业形式和作业量', '作業形式與份量', '숙제 유형과 양', '宿題の形式と量', 'Uri at dami ng takdang-aralin', 'गृहकार्य का प्रकार और मात्रा', 'ਹੋਮਵਰਕ ਦੀ ਕਿਸਮ ਅਤੇ ਮਾਤਰਾ', 'హోంవర్క్ రకం & పరిమాణం', 'வீட்டுப்பாட வகை & அளவு', 'نوع الواجبات وكميتها', 'نوع و حجم تکالیف', 'Домашние задания', 'Tipo e volume de tarefas'],
  'Late work policy': ['Trabajos entregados tarde', 'Nộp bài muộn', '迟交规定', '遲交規定', '늦은 제출 규정', '提出遅れの扱い', 'Huling pagpasa', 'देर से जमा करने का नियम', 'ਦੇਰੀ ਨਾਲ ਜਮ੍ਹਾਂ ਕਰਨ ਦਾ ਨਿਯਮ', 'ఆలస్య సమర్పణ నియమం', 'தாமத சமர்ப்பிப்பு விதி', 'تسليم الواجبات المتأخرة', 'تحویل با تأخیر', 'Сдача с опозданием', 'Entregas atrasadas'],
  'Retakes / test corrections': ['Recuperaciones / correcciones', 'Thi lại / sửa bài', '重考 / 订正', '重考／訂正', '재시험 / 오답 정리', '再テスト・直し', 'Pag-ulit / pagwawasto', 'दोबारा परीक्षा / सुधार', 'ਮੁੜ ਟੈਸਟ / ਸੁਧਾਰ', 'మళ్లీ పరీక్ష / సవరణలు', 'மறுதேர்வு / திருத்தம்', 'إعادة الاختبار / التصحيح', 'آزمون مجدد / اصلاح', 'Пересдачи и работа над ошибками', 'Recuperação / correções'],
  'Class routine': ['Rutina de la clase', 'Nề nếp lớp học', '课堂流程', '課堂流程', '수업 진행 방식', '授業の流れ', 'Takbo ng klase', 'कक्षा की दिनचर्या', 'ਕਲਾਸ ਦੀ ਰੁਟੀਨ', 'తరగతి దినచర్య', 'வகுப்பு நடைமுறை', 'سير الحصة', 'روال کلاس', 'Как проходит урок', 'Rotina da aula'],
  'Schedule': ['Horario', 'Lịch dạy', '课表', '課表', '시간표', '時間割', 'Iskedyul', 'समय-सारणी', 'ਸਮਾਂ-ਸਾਰਣੀ', 'షెడ్యూల్', 'அட்டவணை', 'الجدول', 'برنامه', 'Расписание', 'Horário'],
  'Suggest an update': ['Sugerir un cambio', 'Đề xuất cập nhật', '建议更新', '建議更新', '수정 제안', '更新を提案', 'Magmungkahi ng pagbabago', 'बदलाव सुझाएँ', 'ਬਦਲਾਅ ਸੁਝਾਓ', 'మార్పు సూచించండి', 'மாற்றம் பரிந்துரை', 'اقترح تحديثًا', 'پیشنهاد اصلاح', 'Предложить правку', 'Sugerir atualização'],
  'Report outdated': ['Avisar que está desactualizado', 'Báo thông tin cũ', '报告信息过时', '回報資訊過時', '오래된 정보 신고', '古い情報を報告', 'Iulat na luma na', 'पुरानी जानकारी बताएँ', 'ਪੁਰਾਣੀ ਜਾਣਕਾਰੀ ਦੱਸੋ', 'పాత సమాచారం అని తెలపండి', 'பழைய தகவல் எனத் தெரிவி', 'الإبلاغ عن معلومات قديمة', 'گزارش اطلاعات قدیمی', 'Сообщить, что устарело', 'Avisar que está desatualizado'],
  'Post': ['Publicar', 'Đăng', '发布', '發布', '게시', '投稿', 'I-post', 'पोस्ट करें', 'ਪੋਸਟ ਕਰੋ', 'పోస్ట్ చేయండి', 'பதிவிடு', 'نشر', 'ارسال', 'Отправить', 'Publicar'],
  'Reply': ['Responder', 'Trả lời', '回复', '回覆', '답글', '返信', 'Sumagot', 'जवाब दें', 'ਜਵਾਬ ਦਿਓ', 'ప్రత్యుత్తరం', 'பதில்', 'رد', 'پاسخ', 'Ответить', 'Responder'],
  'Whole campus': ['Todo el campus', 'Toàn trường', '整个校园', '整個校園', '전체 캠퍼스', 'キャンパス全体', 'Buong kampus', 'पूरा कैंपस', 'ਪੂਰਾ ਕੈਂਪਸ', 'మొత్తం క్యాంపస్', 'முழு வளாகம்', 'المدرسة كاملة', 'کل مدرسه', 'Вся школа', 'Campus inteiro'],
  'Rooms with info': ['Salones con información', 'Phòng đã có thông tin', '有信息的教室', '有資訊的教室', '정보가 있는 교실', '情報のある教室', 'Mga silid na may impormasyon', 'जानकारी वाले कमरे', 'ਜਾਣਕਾਰੀ ਵਾਲੇ ਕਮਰੇ', 'సమాచారం ఉన్న గదులు', 'தகவல் உள்ள அறைகள்', 'قاعات بها معلومات', 'کلاس‌هایی که اطلاعات دارند', 'Кабинеты с информацией', 'Salas com informações'],
  'Entrees': ['Platos principales', 'Món chính', '主菜', '主菜', '주요리', '主菜', 'Pangunahing ulam', 'मुख्य व्यंजन', 'ਮੁੱਖ ਪਕਵਾਨ', 'ప్రధాన వంటకాలు', 'முதன்மை உணவுகள்', 'الأطباق الرئيسية', 'غذای اصلی', 'Основные блюда', 'Pratos principais'],
  'Proteins': ['Proteínas', 'Món đạm', '蛋白质类', '蛋白質類', '단백질', 'タンパク質', 'Protina', 'प्रोटीन', 'ਪ੍ਰੋਟੀਨ', 'ప్రొటీన్లు', 'புரதம்', 'البروتينات', 'پروتئین', 'Белковые блюда', 'Proteínas'],
  'Grains': ['Cereales', 'Tinh bột', '主食', '主食', '곡물', '主食', 'Butil', 'अनाज', 'ਅਨਾਜ', 'ధాన్యాలు', 'தானியங்கள்', 'الحبوب', 'غلات', 'Гарниры', 'Grãos'],
  'Vegetables': ['Verduras', 'Rau', '蔬菜', '蔬菜', '채소', '野菜', 'Gulay', 'सब्ज़ियाँ', 'ਸਬਜ਼ੀਆਂ', 'కూరగాయలు', 'காய்கறிகள்', 'الخضروات', 'سبزیجات', 'Овощи', 'Legumes'],
  'Fruits': ['Frutas', 'Trái cây', '水果', '水果', '과일', '果物', 'Prutas', 'फल', 'ਫਲ', 'పండ్లు', 'பழங்கள்', 'الفواكه', 'میوه', 'Фрукты', 'Frutas'],
  'Dairy': ['Lácteos', 'Sữa', '奶类', '奶類', '유제품', '乳製品', 'Gatas', 'डेयरी', 'ਡੇਅਰੀ', 'పాల ఉత్పత్తులు', 'பால் பொருட்கள்', 'الألبان', 'لبنیات', 'Молочное', 'Laticínios'],
  'All classes': ['Todas las clases', 'Tất cả lớp học', '全部课程', '全部課程', '전체 수업', 'すべての授業', 'Lahat ng klase', 'सभी कक्षाएँ', 'ਸਾਰੀਆਂ ਕਲਾਸਾਂ', 'అన్ని తరగతులు', 'அனைத்து வகுப்புகள்', 'كل الفصول', 'همه کلاس‌ها', 'Все предметы', 'Todas as disciplinas'],
  'Every class at Wilcox,': ['Cada clase de Wilcox,', 'Mọi lớp học ở Wilcox,', 'Wilcox 的每一门课，', 'Wilcox 的每一門課，', 'Wilcox의 모든 수업,', 'Wilcoxのすべての授業を、', 'Bawat klase sa Wilcox,', 'Wilcox की हर कक्षा,', 'Wilcox ਦੀ ਹਰ ਕਲਾਸ,', 'Wilcoxలో ప్రతి తరగతి,', 'Wilcox-இன் ஒவ்வொரு வகுப்பும்,', 'كل فصل في Wilcox،', 'همه کلاس‌های Wilcox،', 'Все предметы Wilcox —', 'Cada disciplina da Wilcox,'],
  'explained by students.': ['explicada por estudiantes.', 'do chính học sinh giải thích.', '由同学们来讲解。', '由同學們來講解。', '학생들이 직접 설명해요.', '生徒が解説します。', 'ipinaliwanag ng mga estudyante.', 'छात्रों की ज़ुबानी।', 'ਵਿਦਿਆਰਥੀਆਂ ਦੀ ਜ਼ੁਬਾਨੀ।', 'విద్యార్థులే వివరిస్తారు.', 'மாணவர்களே விளக்குகிறார்கள்.', 'يشرحه الطلاب.', 'به روایت دانش‌آموزان.', 'глазами учеников.', 'explicada pelos alunos.'],
  'School day': ['El día escolar', 'Ngày học', '上学日常', '上學日常', '학교생활', '学校の一日', 'Araw sa paaralan', 'स्कूल का दिन', 'ਸਕੂਲ ਦਾ ਦਿਨ', 'బడి రోజు', 'பள்ளி நாள்', 'اليوم الدراسي', 'روز مدرسه', 'Школьный день', 'Dia na escola'],
  'Get involved': ['Participa', 'Tham gia', '参与其中', '參與其中', '참여하기', '参加しよう', 'Makilahok', 'जुड़ें', 'ਸ਼ਾਮਲ ਹੋਵੋ', 'పాల్గొనండి', 'பங்கேற்க', 'شارك', 'مشارکت کنید', 'Участвуй', 'Participe'],
  'About Wilkipedia': ['Sobre Wilkipedia', 'Về Wilkipedia', '关于 Wilkipedia', '關於 Wilkipedia', 'Wilkipedia 소개', 'Wilkipediaについて', 'Tungkol sa Wilkipedia', 'Wilkipedia के बारे में', 'Wilkipedia ਬਾਰੇ', 'Wilkipedia గురించి', 'Wilkipedia பற்றி', 'عن Wilkipedia', 'درباره Wilkipedia', 'О Wilkipedia', 'Sobre a Wilkipedia'],
  'Who made it?': ['¿Quién lo hizo?', 'Ai làm tài liệu này?', '作者是谁？', '作者是誰？', '누가 만들었나요?', '誰が作りましたか？', 'Sino ang gumawa?', 'इसे किसने बनाया?', 'ਇਹ ਕਿਸਨੇ ਬਣਾਇਆ?', 'దీన్ని ఎవరు తయారు చేశారు?', 'இதை உருவாக்கியவர் யார்?', 'من أعدّه؟', 'چه کسی آن را ساخته؟', 'Кто автор?', 'Quem fez?'],
  // pieces of the live bell schedule
  'Now': ['Ahora', 'Bây giờ', '现在', '現在', '지금', '現在', 'Ngayon', 'अभी', 'ਹੁਣ', 'ఇప్పుడు', 'இப்போது', 'الآن', 'اکنون', 'Сейчас', 'Agora'],
  'ends {t}': ['termina a las {t}', 'kết thúc lúc {t}', '{t} 结束', '{t} 結束', '{t} 종료', '{t}に終了', 'matatapos ng {t}', '{t} बजे खत्म', '{t} ਵਜੇ ਖ਼ਤਮ', '{t}కి ముగుస్తుంది', '{t}க்கு முடியும்', 'تنتهي {t}', 'پایان {t}', 'до {t}', 'termina às {t}'],
  '{t} left': ['quedan {t}', 'còn {t}', '还剩 {t}', '還剩 {t}', '{t} 남음', '残り{t}', '{t} na lang', '{t} बाकी', '{t} ਬਾਕੀ', '{t} మిగిలింది', 'இன்னும் {t}', 'متبقٍ {t}', '{t} مانده', 'осталось {t}', 'faltam {t}'],
  'starts {t}': ['empieza a las {t}', 'bắt đầu lúc {t}', '{t} 开始', '{t} 開始', '{t} 시작', '{t}に開始', 'magsisimula ng {t}', '{t} बजे शुरू', '{t} ਵਜੇ ਸ਼ੁਰੂ', '{t}కి ప్రారంభం', '{t}க்குத் தொடங்கும்', 'يبدأ {t}', 'شروع {t}', 'начало в {t}', 'começa às {t}'],
  'in {t}': ['en {t}', 'sau {t}', '{t}后', '{t}後', '{t} 후', 'あと{t}', 'sa loob ng {t}', '{t} में', '{t} ਵਿੱਚ', '{t}లో', '{t}-இல்', 'بعد {t}', '{t} دیگر', 'через {t}', 'em {t}'],
  'Next': ['Siguiente', 'Tiếp theo', '下一个上课日', '下一個上課日', '다음', '次', 'Susunod', 'अगला', 'ਅਗਲਾ', 'తదుపరి', 'அடுத்து', 'التالي', 'بعدی', 'Далее', 'Próximo'],
  'first bell {t}': ['primer timbre {t}', 'chuông đầu tiên {t}', '第一遍铃 {t}', '第一聲鐘 {t}', '첫 종 {t}', '始業ベル {t}', 'unang bell {t}', 'पहली घंटी {t}', 'ਪਹਿਲੀ ਘੰਟੀ {t}', 'మొదటి గంట {t}', 'முதல் மணி {t}', 'الجرس الأول {t}', 'زنگ اول {t}', 'первый звонок в {t}', 'primeiro sinal {t}'],
  'min': ['min', 'phút', '分钟', '分鐘', '분', '分', 'min', 'मिनट', 'ਮਿੰਟ', 'నిమి', 'நிமி', 'دقيقة', 'دقیقه', 'мин', 'min'],
  'hr': ['h', 'giờ', '小时', '小時', '시간', '時間', 'oras', 'घंटा', 'ਘੰਟਾ', 'గం', 'மணி', 'ساعة', 'ساعت', 'ч', 'h'],
  'announcements': ['anuncios', 'thông báo', '广播通知', '廣播通知', '방송', '連絡', 'anunsyo', 'घोषणाएँ', 'ਘੋਸ਼ਣਾਵਾਂ', 'ప్రకటనలు', 'அறிவிப்புகள்', 'الإعلانات', 'اطلاعیه‌ها', 'объявления', 'avisos'],
  'Period {n}': ['Periodo {n}', 'Tiết {n}', '第{n}节', '第{n}節', '{n}교시', '{n}時間目', 'Period {n}', 'पीरियड {n}', 'ਪੀਰੀਅਡ {n}', 'పీరియడ్ {n}', 'பாடவேளை {n}', 'الحصة {n}', 'زنگ {n}', '{n}-й урок', '{n}º período'],
  'Period {n} final': ['Examen final del periodo {n}', 'Thi cuối kỳ tiết {n}', '第{n}节期末考试', '第{n}節期末考試', '{n}교시 기말고사', '{n}時間目の期末試験', 'Final exam ng period {n}', 'पीरियड {n} की फ़ाइनल परीक्षा', 'ਪੀਰੀਅਡ {n} ਦੀ ਫਾਈਨਲ ਪ੍ਰੀਖਿਆ', 'పీరియడ్ {n} ఫైనల్ పరీక్ష', 'பாடவேளை {n} இறுதித் தேர்வு', 'الاختبار النهائي للحصة {n}', 'امتحان پایانی زنگ {n}', 'Экзамен: {n}-й урок', 'Prova final do {n}º período'],
  'Homecoming Parade': ['Desfile de Homecoming', 'Diễu hành Homecoming', '返校节游行', '返校節遊行', '홈커밍 퍼레이드', 'ホームカミング・パレード', 'Homecoming parade', 'होमकमिंग परेड', 'ਹੋਮਕਮਿੰਗ ਪਰੇਡ', 'హోమ్‌కమింగ్ పరేడ్', 'ஹோம்கமிங் அணிவகுப்பு', 'موكب العودة للمدرسة', 'رژه هوم‌کامینگ', 'Парад Homecoming', 'Desfile de Homecoming'],
};
/* eslint-enable max-len */

// Current language, from Google's own cookie (so both agree)
export function currentLang() {
  const m = document.cookie.match(/(?:^|;\s*)googtrans=\/[^/]+\/([^;]+)/);
  return m ? decodeURIComponent(m[1]) : 'en';
}
const LANG = currentLang();
const COL = CODES.indexOf(LANG);

// t('ends {t}', {t: '12:00'}) → translated, or the English with values filled in
export function t(key, vars = {}) {
  const row = ROWS[key];
  let s = COL >= 0 && row && row.length === CODES.length ? row[COL] : key;
  for (const [k, v] of Object.entries(vars)) s = s.replace(`{${k}}`, v);
  return s;
}
export const translating = COL >= 0;

// "4th Period + announcements", "Period 3", "1st Period final", "SSR + announcements"…
export function periodName(name) {
  if (!translating) return name;
  let m = name.match(/^(?:(\d)(?:st|nd|rd|th) Period|Period (\d))( final)?( \+ announcements)?$/);
  if (m) {
    const n = m[1] || m[2];
    return t(m[3] ? 'Period {n} final' : 'Period {n}', { n }) + (m[4] ? ` + ${t('announcements')}` : '');
  }
  m = name.match(/^(.+?) \+ announcements$/);
  if (m) return `${t(m[1])} + ${t('announcements')}`;
  return t(name);
}

// Swap exact-match UI text for its hand translation and fence it off from Google
const SKIP = new Set(['SCRIPT', 'STYLE', 'TEXTAREA', 'INPUT', 'SELECT', 'OPTION', 'CODE']);
function swap(node) {
  const raw = node.nodeValue;
  const key = raw.trim();
  if (!key || !ROWS[key] || ROWS[key].length !== CODES.length) return;
  const el = node.parentElement;
  if (!el || SKIP.has(el.tagName) || el.closest('[translate="no"]:not(html)') && !el.dataset.i18n) return;
  node.nodeValue = raw.replace(key, t(key));
  if (el.childNodes.length === 1) { el.setAttribute('translate', 'no'); el.dataset.i18n = '1'; }
  else { const span = document.createElement('span'); span.setAttribute('translate', 'no'); node.replaceWith(span); span.append(node); }
}
export function applyGlossary(root = document.body) {
  if (!translating) return;
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const nodes = [];
  while (walker.nextNode()) nodes.push(walker.currentNode);
  nodes.forEach(swap);
  root.querySelectorAll?.('[placeholder]').forEach((el) => {
    const k = el.getAttribute('placeholder');
    if (ROWS[k]) el.setAttribute('placeholder', t(k));
  });
}
// Keep translating what the page draws later. Registered before Google's
// widget loads, so this runs first and Google skips what it fenced off.
export function watchGlossary() {
  if (!translating) return;
  applyGlossary();
  new MutationObserver((muts) => {
    for (const m of muts) {
      for (const n of m.addedNodes) {
        if (n.nodeType === 3) swap(n);
        else if (n.nodeType === 1 && !n.closest?.('#google_translate_element')) applyGlossary(n);
      }
    }
  }).observe(document.body, { childList: true, subtree: true });
}
