import { NextcloudHeaderService } from "./NextcloudHeaderService";
import { NextcloudPollService } from "./NextcloudPollService";

describe("NextcloudPollService", () => {
  it("should be defined", () => {
    const service = new NextcloudPollService();
    expect(service).toBeDefined();
  });
});