PROJECT_ID ?= torch-3
REGION ?= us-east1
REPOSITORY ?= games
IMAGE ?= whiteboard
TAG ?= latest
IMAGE_URI = $(REGION)-docker.pkg.dev/$(PROJECT_ID)/$(REPOSITORY)/$(IMAGE):$(TAG)

.PHONY: build run push deploy

build:
	docker build -t $(IMAGE):$(TAG) .

run: build
	docker run --rm -it -p 8080:8080 -e GOOGLE_APPLICATION_CREDENTIALS=/app/service-account.json -v $(PWD)/service-account.json:/app/service-account.json $(IMAGE):$(TAG)

# first:
# $ gcloud auth configure-docker us-east1-docker.pkg.dev
push:
	docker build -t $(REGION)-docker.pkg.dev/torch-3/games/${IMAGE}:${TAG} .
	docker push $(REGION)-docker.pkg.dev/torch-3/games/${IMAGE}:${TAG}

deploy:
	gcloud run deploy $(IMAGE) \
	  --image $(IMAGE_URI) \
	  --platform managed \
	  --region $(REGION) \
	  --allow-unauthenticated \
	  --set-env-vars GOOGLE_APPLICATION_CREDENTIALS=/app/service-account.json
