FROM python:3.12-slim

WORKDIR /runner
COPY requirements.txt requirements.student.txt ./
RUN pip install --no-cache-dir -r requirements.txt
RUN python -m venv /opt/student-python \
  && /opt/student-python/bin/pip install --no-cache-dir -r requirements.student.txt
RUN useradd --create-home --uid 10001 runner
COPY runner.py /runner/runner.py
ENV PYTHON_RUNNER_STUDENT_PYTHON=/opt/student-python/bin/python \
    PYTHON_RUNNER_STUDENT_ENV_NAME=基础与数据分析环境 \
    PYTHON_RUNNER_STUDENT_ENV_VERSION=student-data-v1 \
    PYTHON_RUNNER_STUDENT_PACKAGES=numpy,pandas,matplotlib,openpyxl
USER runner
EXPOSE 8790
CMD ["python", "-I", "/runner/runner.py"]
