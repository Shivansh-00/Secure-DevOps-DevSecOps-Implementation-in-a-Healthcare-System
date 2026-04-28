pipeline {
  agent any

  options {
    timeout(time: 60, unit: 'MINUTES')
    timestamps()
    ansiColor('xterm')
    disableConcurrentBuilds()
    buildDiscarder(logRotator(numToKeepStr: '20'))
  }

  environment {
    IMAGE_NAME   = "healthcare-app"
    IMAGE_TAG    = "${env.BUILD_NUMBER}-${env.GIT_COMMIT?.take(7) ?: 'local'}"
    REGISTRY     = "ghcr.io/your-org"
    FULL_IMAGE   = "${REGISTRY}/${IMAGE_NAME}:${IMAGE_TAG}"
    SONAR_HOST   = "http://sonarqube:9000"
  }

  stages {

    stage('Checkout') {
      steps {
        checkout scm
        sh 'git rev-parse HEAD > .gitcommit'
      }
    }

    stage('Install Dependencies') {
      steps {
        sh 'npm ci'
      }
    }

    stage('Lint') {
      steps {
        sh 'npm run lint || true'
      }
    }

    stage('Unit Tests + Coverage') {
      steps {
        sh 'npm test -- --ci'
      }
      post {
        always {
          junit allowEmptyResults: true, testResults: 'coverage/junit.xml'
        }
      }
    }

    stage('Secrets Scan (GitLeaks)') {
      steps {
        sh '''
          docker run --rm -v "$PWD":/scan zricethezav/gitleaks:latest \
            detect --source=/scan --redact --report-format sarif \
            --report-path /scan/gitleaks-report.sarif --no-git || \
            (echo "Secrets detected!" && exit 1)
        '''
        archiveArtifacts artifacts: 'gitleaks-report.sarif', allowEmptyArchive: true
      }
    }

    stage('SAST (SonarQube)') {
      steps {
        withCredentials([string(credentialsId: 'sonar-token', variable: 'SONAR_TOKEN')]) {
          sh '''
            docker run --rm -e SONAR_HOST_URL=$SONAR_HOST -e SONAR_TOKEN=$SONAR_TOKEN \
              -v "$PWD":/usr/src sonarsource/sonar-scanner-cli:latest
          '''
        }
      }
    }

    stage('Quality Gate') {
      steps {
        timeout(time: 5, unit: 'MINUTES') {
          waitForQualityGate abortPipeline: true
        }
      }
    }

    stage('Dependency Scan (npm audit + OWASP DC)') {
      steps {
        sh 'npm audit --audit-level=high --json > npm-audit.json || true'
        archiveArtifacts artifacts: 'npm-audit.json', allowEmptyArchive: true

        sh '''
          docker run --rm -v "$PWD":/src owasp/dependency-check:latest \
            --scan /src --format "ALL" --project healthcare-app \
            --out /src/dc-report --failOnCVSS 7 || (echo "High CVE found" && exit 1)
        '''
        archiveArtifacts artifacts: 'dc-report/**', allowEmptyArchive: true
      }
    }

    stage('Build Docker Image') {
      steps {
        sh 'docker build -t $FULL_IMAGE -t $REGISTRY/$IMAGE_NAME:latest .'
      }
    }

    stage('Container Scan (Trivy)') {
      steps {
        sh '''
          docker run --rm -v /var/run/docker.sock:/var/run/docker.sock \
            -v "$PWD":/out aquasec/trivy:latest image \
            --exit-code 1 --severity HIGH,CRITICAL --ignore-unfixed \
            --format sarif -o /out/trivy-report.sarif $FULL_IMAGE
        '''
        archiveArtifacts artifacts: 'trivy-report.sarif', allowEmptyArchive: true
      }
    }

    stage('Sign & Push Image') {
      when { branch 'main' }
      steps {
        withCredentials([usernamePassword(credentialsId: 'registry-creds',
                          usernameVariable: 'REG_USER', passwordVariable: 'REG_PASS')]) {
          sh '''
            echo "$REG_PASS" | docker login $REGISTRY -u "$REG_USER" --password-stdin
            docker push $FULL_IMAGE
            docker push $REGISTRY/$IMAGE_NAME:latest
          '''
        }
      }
    }

    stage('K8s Manifest Scan (kubesec)') {
      steps {
        sh '''
          for f in k8s/*.yaml; do
            docker run --rm -v "$PWD":/k kubesec/kubesec:latest scan /k/$f || true
          done
        '''
      }
    }

    stage('Deploy to Kubernetes') {
      when { branch 'main' }
      steps {
        withCredentials([file(credentialsId: 'kubeconfig', variable: 'KUBECONFIG')]) {
          sh '''
            kubectl apply -f k8s/00-namespace.yaml
            kubectl apply -f k8s/
            kubectl -n healthcare set image deploy/healthcare-app healthcare=$FULL_IMAGE
            kubectl -n healthcare rollout status deploy/healthcare-app --timeout=180s
          '''
        }
      }
    }

    stage('DAST (OWASP ZAP Baseline)') {
      when { branch 'main' }
      steps {
        sh '''
          docker run --rm -v "$PWD":/zap/wrk/:rw -t zaproxy/zap-stable \
            zap-baseline.py -t https://healthcare.example.com \
            -r zap-report.html -m 5 -I || true
        '''
        archiveArtifacts artifacts: 'zap-report.html', allowEmptyArchive: true
      }
    }
  }

  post {
    always {
      sh 'docker logout || true'
      cleanWs()
    }
    failure {
      echo "Build failed — see archived security reports."
    }
  }
}
