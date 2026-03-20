from flask import Flask, render_template, request, jsonify
import os, yaml, random
from ruamel.yaml import YAML

app = Flask(__name__)

TASKS_DIR = "tasks"

USER_TESTS = {}

NUM_TASKS_EXAM = 20
NUM_TASKS_TRAINING = 200

INTERVALS = [
    (0.0, 0.2),
    (0.2, 0.4),
    (0.4, 0.6),
    (0.6, 0.8),
    (0.8, 1.01),
]

yaml_ruamel = YAML()
yaml_ruamel.preserve_quotes = True

def safe_load_yaml(path):
    if not os.path.exists(path):
        return {}
    with open(path, "r", encoding="utf-8") as f:
        return yaml.safe_load(f) or {}

def safe_save_yaml(path, data):
    tmp = path + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        yaml.safe_dump(data, f, allow_unicode=True)
    os.replace(tmp, path)

def get_interval(p):
    for lo, hi in INTERVALS:
        if lo <= p < hi:
            return lo, hi
    return 0.0, 1.0

def update_task_numbers_yaml(path, task_id, alpha, beta):
    with open(path, "r", encoding="utf-8") as f:
        data = yaml_ruamel.load(f)
    for task in data["tasks"]:
        if task["id"] == task_id:
            task["alpha"] = alpha
            task["beta"] = beta
            task["p"] = round(alpha / (alpha + beta), 3)
            break
    with open(path, "w", encoding="utf-8") as f:
        yaml_ruamel.dump(data, f)

def pick_task(tasks, used, p):
    lo, hi = get_interval(p)
    pool = [t for t in tasks if t["id"] not in used and lo <= t.get("p", 0.5) < hi]
    if not pool:
        pool = [t for t in tasks if t["id"] not in used]
    if not pool:
        pool = tasks
    return random.choice(pool) if pool else None

@app.route("/")
def index():
    return render_template("index.html")

@app.route("/api/tests")
def api_tests():
    tests = []
    for fn in os.listdir(TASKS_DIR):
        if fn.endswith(".yaml"):
            data = safe_load_yaml(os.path.join(TASKS_DIR, fn))
            tests.append({
                "id": fn.replace(".yaml", ""),
                "title": data.get("title"),
                "description": data.get("description")
            })
    return jsonify(tests)

@app.route("/start_test", methods=["POST"])
def start_test():
    payload = request.get_json()
    user = payload["user"]
    test_id = payload["test"]

    data = safe_load_yaml(os.path.join(TASKS_DIR, f"{test_id}.yaml"))
    tasks = data["tasks"]
    mold = data["mold"]

    for t in tasks:
        t.setdefault("p", 0.5)
        t.setdefault("alpha", 1)
        t.setdefault("beta", 1)

    student_alpha = 1
    student_beta = 1
    student_p = 0.5
    used = set()

    limit = NUM_TASKS_EXAM if mold == "exam" else NUM_TASKS_TRAINING
    first = pick_task(tasks, used, student_p)
    used.add(first["id"])

    USER_TESTS[user] = {
        "test_id": test_id,
        "tasks": tasks,
        "used": used,
        "student_alpha": student_alpha,
        "student_beta": student_beta,
        "student_p": student_p,
        "limit": limit,
        "mold": mold 
    }

    return jsonify({"next_task": first, "limit": limit})

@app.route("/submit_answer", methods=["POST"])
def submit_answer():
    payload = request.get_json()
    user = payload["user"]
    if user not in USER_TESTS:
        return jsonify({"error": "No active test"}), 400

    session = USER_TESTS[user]
    task = next((t for t in session["tasks"] if t["id"] == payload["task_id"]), None)
    if not task:
        return jsonify({"error": "Task not found"}), 400

    correct = str(payload.get("answer", "")).strip() == str(task.get("answer", "")).strip()

    if correct:
        session["student_alpha"] += 1
    else:
        session["student_beta"] += 1

    session["student_p"] = round(session["student_alpha"] / (session["student_alpha"] + session["student_beta"]), 3)

    alpha, beta = task["alpha"], task["beta"]
    if correct:
        alpha += 1
    else:
        beta += 1

    task["alpha"] = alpha
    task["beta"] = beta
    task["p"] = round(alpha / (alpha + beta), 3)

    if session["mold"] == "training":
        update_task_numbers_yaml(
            path=os.path.join(TASKS_DIR, f"{session['test_id']}.yaml"),
            task_id=task["id"],
            alpha=alpha,
            beta=beta
        )

    next_task = None
    if len(session["used"]) < session["limit"]:
        next_task = pick_task(session["tasks"], session["used"], session["student_p"])
        if next_task:
            session["used"].add(next_task["id"])

    return jsonify({
        "success": correct,
        "p_student": session["student_p"],
        "next_task": next_task
    })

@app.route("/get_correct_answer", methods=["POST"])
def get_correct_answer():
    payload = request.get_json()
    user = payload["user"]
    task_id = payload["task_id"]

    if user not in USER_TESTS:
        return jsonify({"error": "No active test"}), 400

    session = USER_TESTS[user]
    task = next((t for t in session["tasks"] if t["id"] == task_id), None)
    if not task:
        return jsonify({"error": "Task not found"}), 400

    return jsonify({"correct_answer": task.get("answer")})

@app.route("/next_task", methods=["POST"])
def next_task():
    payload = request.get_json()
    user = payload["user"]

    if user not in USER_TESTS:
        return jsonify({"error": "No active test"}), 400

    session = USER_TESTS[user]
    if len(session["used"]) >= session["limit"]:
        return jsonify({"next_task": None, "message": "Тест завершен"})

    next_task_obj = pick_task(session["tasks"], session["used"], session["student_p"])
    if next_task_obj:
        session["used"].add(next_task_obj["id"])

    return jsonify({"next_task": next_task_obj})

if __name__ == "__main__":
    app.run(debug=True)
