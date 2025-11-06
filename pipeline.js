// cicd.js
import { execSync } from "child_process";
import fs from "fs";

const {
  AWS_ACCESS_KEY_ID,
  AWS_SECRET_ACCESS_KEY,
  AWS_REGION = "us-east-1",
  ECR_REPOSITORY = "my-react-app",
  ECS_CLUSTER = "my-cluster",
  ECS_SERVICE = "my-service"
} = process.env;

if (!AWS_ACCESS_KEY_ID || !AWS_SECRET_ACCESS_KEY) {
  console.error("❌ Missing AWS credentials. Please set environment variables.");
  process.exit(1);
}

try {
  console.log("🧱 Step 1: Building React app...");
  execSync("npm install && npm run build", { stdio: "inherit" });

  console.log("🐳 Step 2: Building Docker image...");
  execSync(`docker build -t ${ECR_REPOSITORY}:latest .`, { stdio: "inherit" });

  console.log("🔐 Step 3: Logging into Amazon ECR...");
  execSync(
    `aws ecr get-login-password --region ${AWS_REGION} | docker login --username AWS --password-stdin ${AWS_ACCOUNT_ID}.dkr.ecr.${AWS_REGION}.amazonaws.com`,
    { stdio: "inherit" }
  );

  console.log("📦 Step 4: Tagging and pushing image to ECR...");
  const timestamp = Date.now();
  const fullImage = `${AWS_ACCOUNT_ID}.dkr.ecr.${AWS_REGION}.amazonaws.com/${ECR_REPOSITORY}:${timestamp}`;
  execSync(`docker tag ${ECR_REPOSITORY}:latest ${fullImage}`, { stdio: "inherit" });
  execSync(`docker push ${fullImage}`, { stdio: "inherit" });

  console.log("🧾 Step 5: Fetching ECS task definition...");
  const taskDefFile = "task-def.json";
  execSync(
    `aws ecs describe-task-definition --task-definition ${ECS_SERVICE} --region ${AWS_REGION} > ${taskDefFile}`
  );

  const taskDefData = JSON.parse(fs.readFileSync(taskDefFile, "utf8"));
  delete taskDefData.taskDefinition.taskDefinitionArn;
  delete taskDefData.taskDefinition.revision;
  delete taskDefData.taskDefinition.status;
  delete taskDefData.taskDefinition.requiresAttributes;
  delete taskDefData.taskDefinition.compatibilities;
  delete taskDefData.taskDefinition.registeredAt;
  delete taskDefData.taskDefinition.registeredBy;

  // Update image
  taskDefData.taskDefinition.containerDefinitions[0].image = fullImage;

  fs.writeFileSync("new-task-def.json", JSON.stringify(taskDefData.taskDefinition, null, 2));

  console.log("🪄 Step 6: Registering new ECS task definition...");
  const result = execSync(
    `aws ecs register-task-definition --cli-input-json file://new-task-def.json --region ${AWS_REGION}`,
    { encoding: "utf8" }
  );
  const newTaskDef = JSON.parse(result);
  const revision = newTaskDef.taskDefinition.revision;

  console.log("🚀 Step 7: Updating ECS service...");
  execSync(
    `aws ecs update-service --cluster ${ECS_CLUSTER} --service ${ECS_SERVICE} --task-definition ${ECS_SERVICE}:${revision} --region ${AWS_REGION}`,
    { stdio: "inherit" }
  );

  console.log("✅ Deployment successful!");
  console.log(`🔗 Image: ${fullImage}`);
} catch (err) {
  console.error("❌ Deployment failed:", err.message);
  process.exit(1);
}

