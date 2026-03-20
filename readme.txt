project/
 ├─ app.py                  # backend — Flask-сервер, который обрабатывает запросы от фронтенда
 ├─ tasks/                  # задачи в формате YAML — тесты и задания
 │   ├─ test1.yaml
 │   └─ test2.yaml
 ├─ templates/              # frontend
 │   ├─ index.html
 │   
 └─ static/                 # статика для frontend (CSS и JS)
     ├─ css/
     │   └─ style.css    	# стили интерфейса
     └─ js/
          ├─ marked.min.js  # JS-библиотека для Markdown
          └─ script.js      # основной JS-файл frontend
