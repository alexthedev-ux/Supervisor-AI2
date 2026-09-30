import { Router, type IRouter } from "express";
import healthRouter from "./health";
import supervisorRouter from "./supervisor";

const router: IRouter = Router();

router.use(healthRouter);
router.use(supervisorRouter);

export default router;
