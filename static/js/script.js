const USER_ID = "id1";
let tasks = [],
    currentIndex = 0,
    lastP = 0.5,
    taskLimit = 20,
    testFinished = false;
let currentTestTitle = "";
let currentTestId = ""; // добавлено для запроса новой задачи в skipped

/* ================== ЗАГРУЗКА ТЕСТОВ ================== */
document.addEventListener("DOMContentLoaded", () => showTestList());

async function loadTests() {
    const res = await fetch("/api/tests");
    const tests = await res.json();
    const list = document.querySelector(".test-list");

    if (!tests.length) {
        list.innerHTML = "<h2>Нет доступных тестов</h2>";
        return;
    }

    list.innerHTML = tests
        .map(
            t => `
        <div class="test-card" data-test-id="${t.id}" data-test-title="${encodeURIComponent(
                t.title
            )}">
            <h3>${t.title}</h3>
            <small>${t.description || ""}</small>
        </div>
    `
        )
        .join("");

    document.querySelectorAll(".test-card").forEach(card => {
        card.onclick = () => {
            const testId = card.dataset.testId;
            const testTitle = decodeURIComponent(card.dataset.testTitle);
            startTest(testId, testTitle);
        };
    });
}

function showTestList() {
    document.getElementById("content-area").innerHTML = `
        <div class="main-header">
            Система адаптированной выдачи задач в курсах программирования
        </div>
        <div class="test-list">
            <h1>Загрузка тестов...</h1>
        </div>
    `;
    loadTests();
}

/* ================== СТАРТ ТЕСТА ================== */
async function startTest(testId, testTitle) {
    currentTestTitle = testTitle;
    currentTestId = testId;
    tasks = [];
    currentIndex = 0;
    lastP = 0.5;
    testFinished = false;

    document.getElementById("content-area").innerHTML = `
        <div class="main-header">${currentTestTitle}</div>
        <div class="test-list"><h1>Загрузка теста...</h1></div>
    `;

    const res = await fetch("/start_test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user: USER_ID, test: testId, mode: "exam" }),
    });
    const data = await res.json();
    taskLimit = data.limit || 20;

    if (!data.next_task) {
        alert("Нет задач");
        return showTestList();
    }

    pushTask(data.next_task);
    render();
}

function pushTask(t) {
    tasks.push({
        ...t,
        state: "Pending",
        user_answer: "",
        is_correct: null,
        correct_answer: null,
        p_before: lastP,
        p_after: null,
    });
}

/* ================== РЕНДЕР ================== */
function render() {
    const t = tasks[currentIndex];
    const content = document.getElementById("content-area");

    content.innerHTML = `
        <div class="main-header">${currentTestTitle}</div>
        <div class="task-hint">

            <div class="task-hint">
                <p>
                    Параметр <b>P</b> (от <i>probability</i>) — вероятность правильного ответа
                    студента, вычисляемая и обновляемая байесовским алгоритмом на основе его
                    ответов.
                </p>
                <p>
                    Кнопка <b>«Ответить»</b> отображает решение без изменения <b>P</b>;
                    при этом ввод ответа блокируется, переход к следующей задаче выполняется кнопкой
                    <b>«Вперёд →»</b>.
                </p>
                <p>
                    Навигация между заданиями осуществляется кнопками <b>«← Назад»</b> и
                    <b>«Вперёд →»</b>; до нажатия кнопки "Ответить" навигация ограничена.
                </p>
                <p>
                    В нижней части интерфейса отображается отладочная информация: 
                    изменение параметра <b>P</b> в процессе тестирования и адаптивная выдача заданий различной сложности.
                </p>
                <p>
                    Файл <code>test*.yaml</code> содержит 200 заданий пяти уровней сложности
                    (1–40, 41–80, 81–120, 121–160, 161–200); <code>task_id</code> используется
                    для проверки корректности адаптивного алгоритма.
                </p>
            </div>
        </div>

        <div style="display:flex; gap:10px;">
            <div class="task-box">
                <h2 id="taskTitle">Задача</h2>
                <div class="task-question">${marked.parse(t.text)}</div>
                <input id="answerInput" value="${t.user_answer || ""}">
                <div id="statusLine"></div>

                <div class="task-buttons">
                    <div class="btn-row">
                        <button id="btnPrev">← Назад</button>
                        <button id="btnNext">Вперёд →</button>
                    </div>
                    <div class="btn-row">
                        <button id="btnSubmit">Ответить</button>
                        <button id="btnShow">Показать ответ</button>
                    </div>
                    <div class="btn-row">
                        <button id="btnFinish">Завершить тестирование</button>
                    </div>
                </div>

                <div id="debug" class="task-results"></div>
            </div>

            <div class="task-debug-right">
                <div id="debug-right">
                    <!-- Здесь будет отдельный дебаг справа -->
                </div>
            </div>
        </div>
    `;

    bindButtons();
    updateUI();
    renderDebug();
}

/* ================== UI ================== */
function updateUI() {
    const t = tasks[currentIndex];
    const input = document.getElementById("answerInput");
    input.classList.remove("correct-input", "wrong-input");

    const prev = document.getElementById("btnPrev");
    const next = document.getElementById("btnNext");
    const submit = document.getElementById("btnSubmit");
    const show = document.getElementById("btnShow");

    // Навигация всегда активна, кроме первой/последней задачи
    prev.disabled = currentIndex === 0;
    next.disabled = currentIndex >= tasks.length - 1;

    // Сброс состояния кнопок
    submit.disabled = false;
    show.disabled = false;
    input.disabled = false;

    if (t.state === "Pending") {
        input.disabled = false;
    }

    if (t.state === "answered") {
        input.disabled = true;
        submit.disabled = true;
        show.disabled = false;
        input.classList.add(t.is_correct ? "correct-input" : "wrong-input");
    }

    if (t.state === "skipped") {
        input.disabled = true;
        submit.disabled = true;
        show.disabled = true;
        input.classList.add("wrong-input");

        // Навигация разблокирована для skipped
        prev.disabled = false;
        next.disabled = false;
    }

    // Заголовок задачи (номер + task id)
    const title = document.getElementById("taskTitle");
    if (title) {
        const taskNum = currentIndex + 1;
        title.textContent = `Задача №${taskNum} — task id (${t.id})`;
    }
}

/* ================== ОТВЕТ ================== */
async function submitAnswer() {
    const t = tasks[currentIndex];
    if (t.state !== "Pending") return;

    t.user_answer = document.getElementById("answerInput").value;

    const res = await fetch("/submit_answer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user: USER_ID, task_id: t.id, answer: t.user_answer }),
    });

    const data = await res.json();
    t.state = "answered";
    t.is_correct = data.success;
    t.p_after = data.p_student;
    lastP = data.p_student;

    if (data.next_task && tasks.length < taskLimit) {
        pushTask(data.next_task);
        currentIndex++;
        render();
    } else finishTest();
}

/* ================== ПОКАЗ ОТВЕТА ================== */
async function showAnswer() {
    const t = tasks[currentIndex];
    if (t.state !== "Pending") return;

    await fetch("/submit_answer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user: USER_ID, task_id: t.id, answer: "" }),
    });

    const res = await fetch("/get_correct_answer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user: USER_ID, task_id: t.id }),
    });

    const data = await res.json();

    t.state = "skipped";
    t.is_correct = false;
    t.correct_answer = data.correct_answer;

    document.getElementById("statusLine").textContent =
        "Правильный ответ: " + data.correct_answer + ". Для перехода к следующей задаче нажмите \"Вперёд\"";

    updateUI();
}

/* ================== НАВИГАЦИЯ ================== */
function bindButtons() {
    document.getElementById("btnSubmit").onclick = submitAnswer;
    document.getElementById("btnShow").onclick = showAnswer;

    document.getElementById("btnPrev").onclick = () => {
        currentIndex--;
        render();
    };

    document.getElementById("btnNext").onclick = async () => {
        const t = tasks[currentIndex];

        if (t.state === "skipped" && currentIndex === tasks.length - 1 && tasks.length < taskLimit) {
            const res = await fetch("/start_test", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ user: USER_ID, test: currentTestId, mode: "exam", get_next: true }),
            });
            const data = await res.json();
            if (data.next_task) {
                pushTask(data.next_task);
            }
        }

        if (currentIndex < tasks.length - 1) {
            currentIndex++;
            render();
        }
    };

    document.getElementById("btnFinish").onclick = finishTest;
}

/* ================== DEBUG ================== */
function renderDebug() {
    const dbgRight = document.getElementById("debug-right");
    const t = tasks[currentIndex];

    const titleHTML = `<h2>Логика работы адаптивной выдачи заданий</h2>`;
    const MAX_LINES = 30;

    const lines = tasks
        .map((t, idx) => {
            const taskNum = idx + 1;
            const tid = t.id;
            const difficulty = t.difficulty || "—";

            let statusText = "";
            if (t.state === "Pending") statusText = "ответ не дан";
            else if (t.state === "answered") statusText = t.is_correct ? "решена верно" : "решена неверно";
            else if (t.state === "skipped") statusText = "пропущена";

            const pBefore = t.p_before?.toFixed(3) ?? "—";
            const pAfter = t.p_after?.toFixed(3) ?? "—";

            const pText =
                t.state === "Pending"
                    ? `P студента ${pBefore}→будет рассчитан после решения`
                    : t.state === "skipped"
                    ? `P студента ${pBefore}→${pBefore}`
                    : `P студента ${pBefore}→${pAfter}`;

            let cls = "";
            if (t.state === "answered") cls = t.is_correct === true ? "debug-correct" : "debug-wrong";
            else if (t.state === "skipped") cls = "debug-skipped";
            else if (t.state === "Pending") cls = "debug-pending";

            const line = `Задача ${taskNum}, ${tid}, сложность ${difficulty}, ${statusText}, ${pText}`;
            return cls ? `<span class="${cls}">${line}</span>` : line;
        })
        .reverse()
        .slice(0, MAX_LINES);

    dbgRight.innerHTML = titleHTML + lines.join("<br>");
}

/* ================== FINISH ================== */
function finishTest() {
    if (testFinished) return;
    testFinished = true;

    const correct = tasks.filter(t => t.is_correct === true).length;
    const wrong = tasks.filter(t => t.is_correct === false && t.state === "answered").length;
    const skipped = tasks.filter(t => t.state === "skipped").length;
    const total = correct + wrong + skipped;

    document.getElementById("content-area").innerHTML = `
        <div class="task-box">
            <h1>Тест завершён</h1>
            <p>Решено верно: ${correct}</p>
            <p>Решено неверно: ${wrong}</p>
            <p>Пропущено: ${skipped}</p>
            <p>Итого: ${total}</p>
            <button onclick="showTestList()">← Вернуться к тестам</button>
        </div>
    `;
}
